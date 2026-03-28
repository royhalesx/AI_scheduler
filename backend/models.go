package main

// ---------------------------------------------------------------------------
// Course data types (mirrors courses.json schema)
// ---------------------------------------------------------------------------

type Meeting struct {
	Days      []string `json:"days"`
	StartTime *string  `json:"startTime"`
	EndTime   *string  `json:"endTime"`
	Location  string   `json:"location"`
}

type Seats struct {
	Capacity int `json:"capacity"`
	Enrolled int `json:"enrolled"`
	Available int `json:"available"`
}

type RMPData struct {
	Rating                float64 `json:"rating"`
	Difficulty            float64 `json:"difficulty"`
	WouldTakeAgainPercent float64 `json:"wouldTakeAgainPercent"`
	NumRatings            int     `json:"numRatings"`
}

type Section struct {
	CRN        string    `json:"crn"`
	Instructor string    `json:"instructor"`
	Type       string    `json:"type"`
	Meetings   []Meeting `json:"meetings"`
	Seats      Seats     `json:"seats"`
	RMP        *RMPData  `json:"rmp"`
}

type Course struct {
	Title         string             `json:"title"`
	Credits       float64            `json:"credits"`
	Department    string             `json:"department"`
	Prerequisites []string           `json:"prerequisites"`
	Sections      map[string]Section `json:"sections"`
}

type TermData struct {
	Term      string            `json:"term"`
	Yearterm  string            `json:"yearterm"`
	UpdatedAt string            `json:"updatedAt"`
	Courses   map[string]Course `json:"courses"`
}

// ---------------------------------------------------------------------------
// RMP professor data
// ---------------------------------------------------------------------------

type Professor struct {
	RmpID                 string  `json:"rmpId"`
	FirstName             string  `json:"firstName"`
	LastName              string  `json:"lastName"`
	Rating                float64 `json:"rating"`
	Difficulty            float64 `json:"difficulty"`
	WouldTakeAgainPercent float64 `json:"wouldTakeAgainPercent"`
	NumRatings            int     `json:"numRatings"`
	Department            string  `json:"department"`
}

type RMPFile struct {
	ScrapedAt  string               `json:"scrapedAt"`
	Professors map[string]Professor `json:"professors"`
}

// ---------------------------------------------------------------------------
// Chat request / response types
// ---------------------------------------------------------------------------

type BlockedTime struct {
	Days      []string `json:"days"`
	StartTime string   `json:"startTime"`
	EndTime   string   `json:"endTime"`
}

type Constraints struct {
	BlockedTimes      []BlockedTime `json:"blockedTimes"`
	MaxCredits        *int          `json:"maxCredits"`
	PreferredDaysOff  []string      `json:"preferredDaysOff"`
}

type ScheduleItem struct {
	CourseID  string `json:"courseId"`
	SectionID string `json:"sectionId"`
}

type ChatRequest struct {
	Message         string         `json:"message" binding:"required"`
	Term            string         `json:"term" binding:"required"`
	CurrentSchedule []ScheduleItem `json:"currentSchedule"`
	Constraints     Constraints    `json:"constraints"`
}
