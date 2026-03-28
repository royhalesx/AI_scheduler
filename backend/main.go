package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	reindex := flag.Bool("reindex", false, "Rebuild embedding indexes for all terms")
	reindexAndExit := flag.Bool("reindex-and-exit", false, "Rebuild embedding indexes then exit without starting server")
	port := flag.String("port", "8000", "Port to listen on")
	flag.Parse()

	// Load .env
	if err := godotenv.Load(filepath.Join(filepath.Dir(os.Args[0]), ".env")); err != nil {
		// Try cwd
		_ = godotenv.Load(".env")
	}
	if os.Getenv("GROQ_API_KEY") == "" {
		log.Fatal("GROQ_API_KEY not set — add it to backend/.env")
	}
	if os.Getenv("VOYAGE_API_KEY") == "" {
		log.Fatal("VOYAGE_API_KEY not set — add it to backend/.env")
	}

	baseDir := "."
	dataDir := filepath.Join(baseDir, "data")
	promptFile := filepath.Join(baseDir, "prompts", "schedule_advisor.txt")
	rmpFile := filepath.Join(dataDir, "rmp.json")
	coursesFile := filepath.Join(dataDir, "courses.json")

	// Load courses.json
	log.Println("Loading courses.json...")
	allTerms, err := loadCourses(coursesFile)
	if err != nil {
		log.Fatalf("Failed to load courses.json: %v", err)
	}
	log.Printf("Loaded %d terms", len(allTerms))

	// Load RMP data
	log.Println("Loading RMP data...")
	rmpData, err := loadRMP(rmpFile)
	if err != nil {
		log.Fatalf("Failed to load rmp.json: %v", err)
	}
	log.Printf("Loaded %d professors", len(rmpData))

	// Load system prompt
	promptBytes, err := os.ReadFile(promptFile)
	if err != nil {
		log.Fatalf("Failed to load system prompt: %v", err)
	}
	systemPrompt := string(promptBytes)

	// Build / load embedding indexes
	indexes := make(map[string]EmbeddingIndex)
	shouldBuild := *reindex || *reindexAndExit
	for yearterm, termData := range allTerms {
		if shouldBuild {
			log.Printf("Building embeddings for term %s (%s)...", yearterm, termData.Term)
			index, err := BuildEmbeddings(dataDir, yearterm, termData.Courses)
			if err != nil {
				log.Fatalf("Failed to build embeddings for %s: %v", yearterm, err)
			}
			indexes[yearterm] = index
		} else {
			index, err := LoadEmbeddings(dataDir, yearterm)
			if err != nil {
				log.Printf("No embeddings found for term %s — run with --reindex to build (or they'll be missing at query time)", yearterm)
				continue
			}
			log.Printf("Loaded embeddings for term %s (%d courses)", yearterm, len(index))
			indexes[yearterm] = index
		}
	}

	if *reindexAndExit {
		log.Println("Reindex complete — exiting")
		os.Exit(0)
	}

	state := &appState{
		allTerms:     allTerms,
		rmp:          rmpData,
		indexes:      indexes,
		systemPrompt: systemPrompt,
		dataDir:      dataDir,
	}

	// Router
	r := gin.Default()

	r.Use(corsMiddleware())

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
		api.GET("/terms", state.getTerms)
		api.GET("/courses", state.getCourses)
		api.GET("/courses/:id", state.getCourse)
		api.GET("/professors/:name", state.getProfessor)
		api.POST("/chat", state.chat)
	}

	addr := ":" + *port
	log.Printf("BYU Scheduler API listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

func loadCourses(path string) (map[string]TermData, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var data map[string]TermData
	if err := json.NewDecoder(f).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func loadRMP(path string) (map[string]Professor, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var rmpFile RMPFile
	if err := json.NewDecoder(f).Decode(&rmpFile); err != nil {
		return nil, err
	}
	return rmpFile.Professors, nil
}

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := false
		allowedOrigins := []string{
			"http://localhost:5173",
			"http://localhost:3000",
		}
		for _, o := range allowedOrigins {
			if origin == o {
				allowed = true
				break
			}
		}
		// Also allow any vercel.app subdomain
		if !allowed && len(origin) > 0 {
			if len(origin) > 11 && origin[len(origin)-11:] == ".vercel.app" {
				allowed = true
			}
		}

		if allowed {
			c.Header("Access-Control-Allow-Origin", origin)
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func init() {
	// Suppress unused import warning
	_ = fmt.Sprintf
}
