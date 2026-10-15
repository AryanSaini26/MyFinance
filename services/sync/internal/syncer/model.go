package syncer

import (
	_ "embed"
	"encoding/json"
	"math"
	"regexp"
	"sort"
	"strings"
)

//go:embed model.json
var modelJSON []byte

type modelClass struct {
	Documents int            `json:"documents"`
	Total     int            `json:"total"`
	Counts    map[string]int `json:"counts"`
}
type model struct {
	Documents  int                   `json:"documents"`
	Vocabulary []string              `json:"vocabulary"`
	Classes    map[string]modelClass `json:"classes"`
}

var trainedModel = func() model {
	var m model
	if err := json.Unmarshal(modelJSON, &m); err != nil {
		panic(err)
	}
	return m
}()
var words = regexp.MustCompile(`[a-z]+`)

func Predict(text string) string {
	vocabulary := map[string]bool{}
	for _, v := range trainedModel.Vocabulary {
		vocabulary[v] = true
	}
	tokens := []string{}
	for _, v := range words.FindAllString(strings.ToLower(text), -1) {
		if vocabulary[v] {
			tokens = append(tokens, v)
		}
	}
	if len(tokens) == 0 {
		return "other"
	}
	names := []string{}
	for name := range trainedModel.Classes {
		names = append(names, name)
	}
	sort.Strings(names)
	best := math.Inf(-1)
	category := "other"
	for _, name := range names {
		c := trainedModel.Classes[name]
		score := math.Log(float64(c.Documents) / float64(trainedModel.Documents))
		for _, v := range tokens {
			score += math.Log(float64(c.Counts[v]+1) / float64(c.Total+len(vocabulary)))
		}
		if score > best {
			best = score
			category = name
		}
	}
	return category
}
