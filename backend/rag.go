package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	embeddingModel   = "voyage-3-lite"
	embeddingDims    = 512
	topK             = 20
	embeddingDelay   = 250 * time.Millisecond // ~240 req/min, well under Voyage free tier (300 RPM)
	maxRetries       = 5
	maxTokensPerRun  = 5_000_000 // hard abort at 5M tokens (~12x a full reindex); free tier is 200M/month
)

// ---------------------------------------------------------------------------
// Text generation for embedding
// ---------------------------------------------------------------------------

// courseToText builds a rich human-readable description of a course for embedding.
func courseToText(id string, course Course) string {
	var sb strings.Builder

	fmt.Fprintf(&sb, "%s - %s (%.1f credits, %s department)\n", id, course.Title, course.Credits, course.Department)

	if len(course.Prerequisites) > 0 {
		fmt.Fprintf(&sb, "Prerequisites: %s\n", strings.Join(course.Prerequisites, ", "))
	}

	sb.WriteString("Sections:\n")
	for secNum, sec := range course.Sections {
		sb.WriteString("  Section ")
		sb.WriteString(secNum)
		sb.WriteString(": ")

		// Meeting times
		var meetingParts []string
		for _, m := range sec.Meetings {
			if len(m.Days) > 0 {
				days := strings.Join(m.Days, " ")
				start := "TBA"
				end := "TBA"
				if m.StartTime != nil {
					start = *m.StartTime
				}
				if m.EndTime != nil {
					end = *m.EndTime
				}
				meetingParts = append(meetingParts, fmt.Sprintf("%s %s-%s at %s", days, start, end, m.Location))
			}
		}
		if len(meetingParts) > 0 {
			sb.WriteString(strings.Join(meetingParts, "; "))
		} else {
			sb.WriteString("Online/TBA")
		}

		// Instructor + RMP
		fmt.Fprintf(&sb, " | Instructor: %s", sec.Instructor)
		if sec.RMP != nil {
			fmt.Fprintf(&sb, " | RMP: %.1f/5, difficulty %.1f, %.0f%% recommend",
				sec.RMP.Rating, sec.RMP.Difficulty, sec.RMP.WouldTakeAgainPercent)
		}

		// Seats
		fmt.Fprintf(&sb, " | Seats: %d/%d available\n", sec.Seats.Available, sec.Seats.Capacity)
	}

	return sb.String()
}

// ---------------------------------------------------------------------------
// Voyage AI embedding API
// ---------------------------------------------------------------------------

type voyageEmbedRequest struct {
	Input     []string `json:"input"`
	Model     string   `json:"model"`
	InputType string   `json:"input_type"`
}

type voyageEmbedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

func callEmbeddingAPI(text, inputType string) ([]float32, error) {
	apiKey := os.Getenv("VOYAGE_API_KEY")
	const url = "https://api.voyageai.com/v1/embeddings"

	bodyBytes, err := json.Marshal(voyageEmbedRequest{
		Input:     []string{text},
		Model:     embeddingModel,
		InputType: inputType,
	})
	if err != nil {
		return nil, err
	}

	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			delay := time.Duration(attempt+1) * 10 * time.Second
			fmt.Printf("  Rate limited — retrying in %v (attempt %d/%d)\n", delay, attempt+1, maxRetries)
			time.Sleep(delay)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("embedding API error %d: %s", resp.StatusCode, string(body))
		}

		var result voyageEmbedResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, err
		}
		if len(result.Data) == 0 {
			return nil, fmt.Errorf("empty embedding response")
		}
		return result.Data[0].Embedding, nil
	}
	return nil, fmt.Errorf("embedding failed after %d attempts", maxRetries)
}

// EmbedQuery embeds a user query for retrieval.
func EmbedQuery(text string) ([]float32, error) {
	return callEmbeddingAPI(text, "query")
}

// ---------------------------------------------------------------------------
// Index: build + save + load
// ---------------------------------------------------------------------------

// EmbeddingIndex maps courseID → embedding vector for one term.
type EmbeddingIndex map[string][]float32

func embeddingFilePath(dataDir, yearterm string) string {
	return filepath.Join(dataDir, fmt.Sprintf("embeddings_%s.json", yearterm))
}

// BuildEmbeddings computes embeddings for all courses in a term and saves to disk.
func BuildEmbeddings(dataDir, yearterm string, courses map[string]Course) (EmbeddingIndex, error) {
	index := make(EmbeddingIndex, len(courses))
	total := len(courses)
	i := 0
	totalTokens := 0

	for id, course := range courses {
		i++
		text := courseToText(id, course)

		// Rough token estimate: ~4 chars per token
		estimatedTokens := len(text) / 4
		totalTokens += estimatedTokens
		if totalTokens > maxTokensPerRun {
			return nil, fmt.Errorf("token budget exceeded (%d estimated tokens) — aborting to prevent unexpected charges", totalTokens)
		}

		vec, err := callEmbeddingAPI(text, "document")
		if err != nil {
			return nil, fmt.Errorf("embedding %s: %w", id, err)
		}
		index[id] = vec

		if i%50 == 0 || i == total {
			fmt.Printf("  Embedded %d/%d courses (~%dk tokens used)...\n", i, total, totalTokens/1000)
		}
		time.Sleep(embeddingDelay)
	}

	// Save to disk
	outPath := embeddingFilePath(dataDir, yearterm)
	f, err := os.Create(outPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if err := json.NewEncoder(f).Encode(index); err != nil {
		return nil, err
	}

	fmt.Printf("  Saved embeddings to %s\n", outPath)
	return index, nil
}

// LoadEmbeddings reads a saved embedding index from disk.
func LoadEmbeddings(dataDir, yearterm string) (EmbeddingIndex, error) {
	path := embeddingFilePath(dataDir, yearterm)
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var index EmbeddingIndex
	if err := json.NewDecoder(f).Decode(&index); err != nil {
		return nil, err
	}
	return index, nil
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

func cosineSimilarity(a, b []float32) float32 {
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return float32(dot / (math.Sqrt(normA) * math.Sqrt(normB)))
}

type scoredCourse struct {
	id    string
	score float32
}

// Retrieve returns the top-K course IDs most similar to the query vector.
func Retrieve(queryVec []float32, index EmbeddingIndex, k int) []string {
	scored := make([]scoredCourse, 0, len(index))
	for id, vec := range index {
		scored = append(scored, scoredCourse{id: id, score: cosineSimilarity(queryVec, vec)})
	}
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	if k > len(scored) {
		k = len(scored)
	}
	ids := make([]string, k)
	for i := 0; i < k; i++ {
		ids[i] = scored[i].id
	}
	return ids
}

// ---------------------------------------------------------------------------
// Build context string from retrieved courses
// ---------------------------------------------------------------------------

// BuildRAGContext formats retrieved courses as a structured context block for the prompt.
func BuildRAGContext(courseIDs []string, courses map[string]Course) string {
	var sb strings.Builder
	sb.WriteString("--- RETRIEVED COURSE CONTEXT ---\n\n")

	for _, id := range courseIDs {
		course, ok := courses[id]
		if !ok {
			continue
		}
		sb.WriteString(courseToText(id, course))
		sb.WriteString("\n")
	}

	sb.WriteString("--- END CONTEXT ---")
	return sb.String()
}
