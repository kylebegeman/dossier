package serve

import "sync"

// event is one server-sent event. Data never holds a newline.
type event struct {
	name string
	data string
}

// hub fans events out to every open event stream. Closing it ends every
// stream, which is how shutdown releases them.
type hub struct {
	mu     sync.Mutex
	subs   map[chan event]struct{}
	closed bool
}

func newHub() *hub { return &hub{subs: map[chan event]struct{}{}} }

// subscribe returns a stream of events and its release. ok is false once the
// hub is closed.
func (h *hub) subscribe() (events <-chan event, release func(), ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return nil, func() {}, false
	}
	ch := make(chan event, 8)
	h.subs[ch] = struct{}{}
	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if _, open := h.subs[ch]; open {
			delete(h.subs, ch)
			close(ch)
		}
	}, true
}

// publish delivers without blocking; a subscriber whose buffer is full misses
// the event, which is safe because every event means "look again".
func (h *hub) publish(name, data string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- event{name: name, data: data}:
		default:
		}
	}
}

func (h *hub) close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	for ch := range h.subs {
		delete(h.subs, ch)
		close(ch)
	}
}

func (h *hub) count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs)
}
