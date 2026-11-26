package uci_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/testdata"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

type fixtures struct {
	Info []struct {
		Name       string          `json:"name"`
		Line       string          `json:"line"`
		SideToMove string          `json:"side_to_move"`
		Expect     json.RawMessage `json:"expect"`
	} `json:"info"`
	Bestmove []struct {
		Line   string  `json:"line"`
		Expect *string `json:"expect"`
	} `json:"bestmove"`
}

func load(t *testing.T) fixtures {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(testdata.Contracts(t), "fixtures/uci/info-lines.json"))
	if err != nil {
		t.Fatal(err)
	}
	var f fixtures
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Info) == 0 || len(f.Bestmove) == 0 {
		t.Fatal("empty fixtures")
	}
	return f
}

// The shared fixtures (contracts/fixtures/uci) are the parser's source of truth.
func TestInfoFixtures(t *testing.T) {
	for _, c := range load(t).Info {
		t.Run(c.Name, func(t *testing.T) {
			got, ok := uci.ParseInfo(c.Line)
			if string(c.Expect) == "null" {
				if ok {
					t.Fatalf("line should be skipped, got %+v", got)
				}
				return
			}
			if !ok {
				t.Fatal("line was skipped")
			}
			var want uci.Line
			if err := json.Unmarshal(c.Expect, &want); err != nil {
				t.Fatal(err)
			}
			got = got.ForWhite(c.SideToMove[0])
			gotJSON, _ := json.Marshal(got)
			wantJSON, _ := json.Marshal(want)
			if !reflect.DeepEqual(gotJSON, wantJSON) {
				t.Fatalf("got  %s\nwant %s", gotJSON, wantJSON)
			}
		})
	}
}

func TestBestmoveFixtures(t *testing.T) {
	for _, c := range load(t).Bestmove {
		move, ok := uci.ParseBestmove(c.Line)
		if !ok {
			t.Fatalf("%q not read as bestmove", c.Line)
		}
		want := ""
		if c.Expect != nil {
			want = *c.Expect
		}
		if move != want {
			t.Fatalf("%q: got %q, want %q", c.Line, move, want)
		}
	}
	if _, ok := uci.ParseBestmove("info depth 1 pv e2e4"); ok {
		t.Fatal("info line read as bestmove")
	}
}

// White's view is the identity for White to move and must not touch the original line.
func TestForWhiteDoesNotAlias(t *testing.T) {
	l, ok := uci.ParseInfo("info depth 3 multipv 1 score cp 50 wdl 600 300 100 pv e7e5")
	if !ok {
		t.Fatal("skipped")
	}
	b := l.ForWhite('b')
	if *l.Score.CP != 50 || l.WDL[0] != 600 {
		t.Fatalf("original changed: %+v", l)
	}
	if *b.Score.CP != -50 || b.WDL[0] != 100 || b.WDL[2] != 600 {
		t.Fatalf("black view wrong: %+v", b)
	}
}

func TestMalformedLinesAreSkipped(t *testing.T) {
	for _, line := range []string{
		"", "info", "info depth", "info score cp", "info score cp x pv e2e4",
		"info score centipawns 3 pv e2e4", "info depth 4 score cp 1 wdl 1 2 pv e2e4", "readyok",
	} {
		if l, ok := uci.ParseInfo(line); ok {
			t.Fatalf("%q parsed as %+v", line, l)
		}
	}
}
