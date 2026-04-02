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
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Per-IP rate limiter (rolling 60-second window)
// ---------------------------------------------------------------------------

const maxChatRequestsPerMinutePerIP = 8

type ipRateLimiter struct {
	mu      sync.Mutex
	windows map[string][]time.Time
}

var chatLimiter = &ipRateLimiter{windows: make(map[string][]time.Time)}

func init() {
	// Periodically clean up stale entries to prevent unbounded memory growth.
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			chatLimiter.mu.Lock()
			cutoff := time.Now().Add(-time.Minute)
			for ip, times := range chatLimiter.windows {
				filtered := times[:0]
				for _, t := range times {
					if t.After(cutoff) {
						filtered = append(filtered, t)
					}
				}
				if len(filtered) == 0 {
					delete(chatLimiter.windows, ip)
				} else {
					chatLimiter.windows[ip] = filtered
				}
			}
			chatLimiter.mu.Unlock()
		}
	}()
}

// allow returns true if the IP is within its rate limit, false if exceeded.
func (r *ipRateLimiter) allow(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-time.Minute)

	r.mu.Lock()
	defer r.mu.Unlock()

	times := r.windows[ip]
	// Drop timestamps outside the rolling window.
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= maxChatRequestsPerMinutePerIP {
		r.windows[ip] = valid
		return false
	}

	r.windows[ip] = append(valid, now)
	return true
}

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
// POST /api/schedule/export?term=20265
// Body: [{"courseId":"CS 235","sectionId":"001"}, ...]
// ---------------------------------------------------------------------------

type ExportedCourse struct {
	CourseID   string    `json:"courseId"`
	CourseName string    `json:"courseName"`
	Section    string    `json:"section"`
	CRN        string    `json:"crn"`
	Instructor string    `json:"instructor"`
	Credits    float64   `json:"credits"`
	Meetings   []Meeting `json:"meetings"`
}

func (s *appState) exportSchedule(c *gin.Context) {
	termData, ok := s.resolveTerm(c)
	if !ok {
		return
	}

	var items []ScheduleItem
	if err := c.ShouldBindJSON(&items); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must be [{courseId, sectionId}]"})
		return
	}

	var result []ExportedCourse
	for _, item := range items {
		course, exists := termData.Courses[item.CourseID]
		if !exists {
			continue
		}

		sec, ok := course.Sections[item.SectionID]
		if !ok {
			// fall back to first section
			for id, s := range course.Sections {
				item.SectionID = id
				sec = s
				break
			}
		}

		result = append(result, ExportedCourse{
			CourseID:   item.CourseID,
			CourseName: course.Title,
			Section:    item.SectionID,
			CRN:        sec.CRN,
			Instructor: sec.Instructor,
			Credits:    course.Credits,
			Meetings:   sec.Meetings,
		})
	}

	c.Header("Content-Disposition", `attachment; filename="schedule.json"`)
	c.JSON(http.StatusOK, result)
}

// ---------------------------------------------------------------------------
// POST /api/chat  (SSE streaming)
// ---------------------------------------------------------------------------

func (s *appState) chat(c *gin.Context) {
	// Rate-limit per client IP.
	ip := c.ClientIP()
	if !chatLimiter.allow(ip) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "You've sent a lot of messages — give it a minute and try again.",
		})
		return
	}

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

	// 2. Retrieve top-K relevant courses, always pinning the student's current schedule
	// and any single-course graduation requirements (so the AI has section data for them).
	pinnedIDs := make([]string, 0, len(req.CurrentSchedule)+10)
	for _, item := range req.CurrentSchedule {
		pinnedIDs = append(pinnedIDs, item.CourseID)
	}
	// Extract course IDs from remaining requirements to pin in RAG context.
	// Single-option entries: e.g. "CS 235 (Major, 3cr)" → pin "CS 235"
	// Multi-option GE entries: e.g. "... GE [ART 101/MUSIC 101/...] (3cr)" → pin first 3 options
	const maxPinnedReqs = 20
	pinnedReqCount := 0
	for _, remaining := range req.RemainingRequirements {
		if pinnedReqCount >= maxPinnedReqs {
			break
		}
		if start := strings.Index(remaining, "["); start >= 0 {
			end := strings.Index(remaining, "]")
			if end > start {
				options := strings.Split(remaining[start+1:end], "/")
				for i, opt := range options {
					if i >= 3 {
						break
					}
					opt = strings.TrimSpace(opt)
					if opt != "" {
						pinnedIDs = append(pinnedIDs, opt)
						pinnedReqCount++
					}
				}
			}
			continue
		}
		// Course ID is everything before the first " ("
		if idx := strings.Index(remaining, " ("); idx > 0 {
			pinnedIDs = append(pinnedIDs, remaining[:idx])
			pinnedReqCount++
		}
	}

	index, hasIndex := s.indexes[req.Term]
	var ragContext string
	if hasIndex {
		topIDs := Retrieve(queryVec, index, topK)
		ragContext = BuildRAGContextWithPinned(pinnedIDs, topIDs, termData.Courses)
	} else {
		ragContext = "No embedding index available for this term."
	}

	// 3. Build the user message with RAG context
	scheduleJSON, _ := json.MarshalIndent(req.CurrentSchedule, "", "  ")
	constraintsJSON, _ := json.MarshalIndent(req.Constraints, "", "  ")

	major := req.Major
	if major == "" {
		major = "Not specified"
	}
	completedStr := "None"
	if len(req.CompletedCourses) > 0 {
		const maxCompleted = 50
		if len(req.CompletedCourses) <= maxCompleted {
			completedStr = strings.Join(req.CompletedCourses, ", ")
		} else {
			completedStr = strings.Join(req.CompletedCourses[:maxCompleted], ", ") +
				fmt.Sprintf(" … and %d more (treat all as completed)", len(req.CompletedCourses)-maxCompleted)
		}
	}
	remainingStr := "Not specified"
	if len(req.RemainingRequirements) > 0 {
		remainingStr = strings.Join(req.RemainingRequirements, ", ")
	}

	userMessage := fmt.Sprintf(`Student question: %s

Major: %s
Completed courses: %s
Still needed for graduation: %s

Current schedule:
%s

Constraints (blocked times use 24-hour format, e.g. "14:00" = 2:00 PM):
%s

Term: %s

Use ONLY the course data in the RETRIEVED COURSE CONTEXT below for specific facts (times, ratings, seat availability, instructor names). Use general knowledge for degree requirements and broader advice.

%s`,
		req.Message,
		major,
		completedStr,
		remainingStr,
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
		err := streamGemini(s.systemPrompt, userMessage, w)
		if err != nil {
			fmt.Fprintf(w, "data: {\"type\":\"error\",\"content\":%q}\n\n", err.Error())
		}
		fmt.Fprintf(w, "data: {\"type\":\"done\"}\n\n")
		return false
	})
}

// ---------------------------------------------------------------------------
// Gemini streaming chat (OpenAI-compatible API)
// ---------------------------------------------------------------------------

const geminiModel = "gemini-2.5-flash"
const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

type geminiRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []geminiMessage `json:"messages"`
	Stream    bool            `json:"stream"`
}

type geminiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func streamGemini(systemPrompt, userMessage string, w io.Writer) error {
	apiKey := os.Getenv("GEMINI_API_KEY")

	reqBody := geminiRequest{
		Model:     geminiModel,
		// Generous limit so multi-course explanations + JSON action block are not truncated mid-sentence.
		MaxTokens: 8192,
		Messages: []geminiMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMessage},
		},
		Stream: true,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, geminiBaseURL, bytes.NewReader(bodyBytes))
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
		return fmt.Errorf("Gemini API error %d: %s", resp.StatusCode, string(b))
	}

	// Parse OpenAI-compatible SSE stream and re-emit as our SSE format.
	// Use ReadString, not bufio.Scanner — Scanner's default max line size (64KiB) can abort on large chunks.
	br := bufio.NewReader(resp.Body)
	for {
		rawLine, readErr := br.ReadString('\n')
		line := strings.TrimSuffix(strings.TrimSuffix(rawLine, "\r\n"), "\n")
		line = strings.TrimSuffix(line, "\r")

		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if data != "" && data != "[DONE]" {
				var chunk struct {
					Choices []struct {
						Delta struct {
							Content string `json:"content"`
						} `json:"delta"`
					} `json:"choices"`
				}
				if jsonErr := json.Unmarshal([]byte(data), &chunk); jsonErr == nil {
					if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
						outChunk, _ := json.Marshal(map[string]string{
							"type":    "text",
							"content": chunk.Choices[0].Delta.Content,
						})
						fmt.Fprintf(w, "data: %s\n\n", outChunk)
					}
				}
			}
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return readErr
		}
	}

	return nil
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
