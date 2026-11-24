package items

import "testing"

func TestParseNewItem(t *testing.T) {
	long := make([]byte, 101)
	for i := range long {
		long[i] = 'a'
	}
	cases := []struct {
		body string
		ok   bool
	}{
		{`{"name":"Ruy Lopez"}`, true},
		{`{"name":"Ñandú ♞"}`, true},
		{`{"name":""}`, false},
		{`{"name":"` + string(long) + `"}`, false},
		{`{}`, false},
		{`{"name":"a","extra":1}`, false},
		{`{"name":5}`, false},
		{`[]`, false},
		{`{"name":"a"}{"name":"b"}`, false},
		{``, false},
		{`{"name":"a\u0000b"}`, false},
		{`{"name":"tab\there"}`, false},
	}
	for _, c := range cases {
		_, err := ParseNewItem([]byte(c.body))
		if (err == nil) != c.ok {
			t.Errorf("ParseNewItem(%q): err=%v, want ok=%v", c.body, err, c.ok)
		}
	}
}
