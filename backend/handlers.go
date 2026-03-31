package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// appState holds all in-memory data shared across handlers.
type appState struct {
	allTerms   map[string]TermData      // yearterm → TermData
	rmp        map[string]Professor     // normalized name → Professor
	indexes    map[string]EmbeddingIndex // yearterm → EmbeddingIndex
	systemPrompt string
	dataDir    string
}

// ---------------------------------------------------------------------------
// GET /api/terms
// ---------------------------------------------------------------------------

func (s *appState) getTerms(c *gin.Context) {
	type termSummary struct {
		Term      string `json:"term"`
		Yearterm  string `json:"yearterm"`
		UpdatedAt string `json:"updatedAt"`
	}
	result := make(map[string]termSummary, len(s.allTerms))
	for code, data := range s.allTerms {
		result[code] = termSummary{
			Term:      data.Term,
			Yearterm:  data.Yearterm,
			UpdatedAt: data.UpdatedAt,
		}
	}
	c.JSON(http.StatusOK, result)
}

// ---------------------------------------------------------------------------
// GET /api/courses?term=20263[&department=CS]
// ---------------------------------------------------------------------------

func (s *appState) getCourses(c *gin.Context) {
	termData, ok := s.resolveTerm(c)
	if !ok {
		return
	}

	courses := termData.Courses
	if dept := strings.ToUpper(c.Query("department")); dept != "" {
		filtered := make(map[string]Course)
		for id, course := range courses {
			if strings.ToUpper(course.Department) == dept {
				filtered[id] = course
			}
		}
		courses = filtered
	}

	c.Header("Cache-Control", "public, max-age=3600")
	c.JSON(http.StatusOK, gin.H{"term": termData.Term, "courses": courses})
}

// ---------------------------------------------------------------------------
// GET /api/courses/:id?term=20263   ("CS-235" → "CS 235")
// ---------------------------------------------------------------------------

func (s *appState) getCourse(c *gin.Context) {
	termData, ok := s.resolveTerm(c)
	if !ok {
		return
	}

	courseID := strings.ReplaceAll(c.Param("id"), "-", " ")
	course, exists := termData.Courses[courseID]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("course '%s' not found in term '%s'", courseID, c.Query("term"))})
		return
	}
	c.JSON(http.StatusOK, course)
}

// ---------------------------------------------------------------------------
// GET /api/professors/:name
// ---------------------------------------------------------------------------

func (s *appState) getProfessor(c *gin.Context) {
	name := c.Param("name")
	normalized := normalizeInstructor(name)

	if prof, ok := s.rmp[normalized]; ok {
		c.JSON(http.StatusOK, prof)
		return
	}

	// Fallback: partial match
	nameLower := strings.ToLower(name)
	for key, prof := range s.rmp {
		if strings.Contains(key, nameLower) || strings.Contains(nameLower, key) {
			c.JSON(http.StatusOK, prof)
			return
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("professor '%s' not found", name)})
}

// ---------------------------------------------------------------------------
// POST /api/chat  (SSE streaming)
// ---------------------------------------------------------------------------

func (s *appState) chat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	termData, ok := s.resolveTermByCode(c, req.Term)
	if !ok {
		return
	}

	// 1. Embed the user query
	queryVec, err := EmbedQuery(req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "embedding failed: " + err.Error()})
		return
	}

	// 2. Retrieve top-K relevant courses
	index, hasIndex := s.indexes[req.Term]
	var ragContext string
	if hasIndex {
		topIDs := Retrieve(queryVec, index, topK)
		ragContext = BuildRAGContext(topIDs, termData.Courses)
	} else {
		ragContext = "No embedding index available for this term."
	}

	// 3. Build the user message with RAG context
	scheduleJSON, _ := json.MarshalIndent(req.CurrentSchedule, "", "  ")
	constraintsJSON, _ := json.MarshalIndent(req.Constraints, "", "  ")

	userMessage := fmt.Sprintf(`Student question: %s

Current schedule:
%s

Constraints:
%s

Term: %s

%s

Answer using ONLY the course data in the RETRIEVED COURSE CONTEXT above for specific facts (times, ratings, seat availability, instructor names). You may use your general knowledge about BYU academics, degree requirements, and course difficulty for broader advice.`,
		req.Message,
		string(scheduleJSON),
		string(constraintsJSON),
		termData.Term,
		ragContext,
	)

	// 4. Stream from Gemini
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		err := streamGroq(s.systemPrompt, userMessage, w)
		if err != nil {
			fmt.Fprintf(w, "data: {\"type\":\"error\",\"content\":%q}\n\n", err.Error())
		}
		fmt.Fprintf(w, "data: {\"type\":\"done\"}\n\n")
		return false
	})
}

// ---------------------------------------------------------------------------
// Groq streaming chat (OpenAI-compatible API)
// ---------------------------------------------------------------------------

const groqModel = "llama-3.3-70b-versatile"

type groqRequest struct {
	Model     string         `json:"model"`
	MaxTokens int            `json:"max_tokens"`
	Messages  []groqMessage  `json:"messages"`
	Stream    bool           `json:"stream"`
}

type groqMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func streamGroq(systemPrompt, userMessage string, w io.Writer) error {
	apiKey := os.Getenv("GROQ_API_KEY")

	reqBody := groqRequest{
		Model:     groqModel,
		MaxTokens: 2048,
		Messages: []groqMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMessage},
		},
		Stream: true,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Groq API error %d: %s", resp.StatusCode, string(b))
	}

	// Parse OpenAI-compatible SSE stream and re-emit as our SSE format
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" || data == "" {
			continue
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			outChunk, _ := json.Marshal(map[string]string{
				"type":    "text",
				"content": chunk.Choices[0].Delta.Content,
			})
			fmt.Fprintf(w, "data: %s\n\n", outChunk)
		}
	}

	return scanner.Err()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (s *appState) resolveTerm(c *gin.Context) (TermData, bool) {
	return s.resolveTermByCode(c, c.Query("term"))
}

func (s *appState) resolveTermByCode(c *gin.Context, term string) (TermData, bool) {
	if term == "" {
		keys := make([]string, 0, len(s.allTerms))
		for k := range s.allTerms {
			keys = append(keys, k)
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "term query parameter required", "available": keys})
		return TermData{}, false
	}
	data, ok := s.allTerms[term]
	if !ok {
		keys := make([]string, 0, len(s.allTerms))
		for k := range s.allTerms {
			keys = append(keys, k)
		}
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("term '%s' not found", term), "available": keys})
		return TermData{}, false
	}
	return data, true
}

func normalizeInstructor(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if idx := strings.Index(name, ","); idx >= 0 {
		last := strings.TrimSpace(name[:idx])
		rest := strings.TrimSpace(name[idx+1:])
		parts := strings.Fields(rest)
		first := ""
		if len(parts) > 0 {
			first = parts[0]
		}
		return last + ", " + first
	}
	return name
}
