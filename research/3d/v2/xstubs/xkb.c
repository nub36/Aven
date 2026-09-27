/* libxkbcommon.so.0 headless stub (version V_0.5.0) */
#include <stddef.h>
struct xkb_context; struct xkb_keymap; struct xkb_state; struct xkb_compose_table; struct xkb_compose_state;
struct xkb_context* xkb_context_new(int flags) { return 0; }
void xkb_context_unref(struct xkb_context* c) {}
struct xkb_keymap* xkb_keymap_new_from_string(struct xkb_context* c, const char* s, int fmt) { return 0; }
void xkb_keymap_unref(struct xkb_keymap* k) {}
int xkb_keymap_mod_get_index(struct xkb_keymap* k, const char* n) { return 0; }
int xkb_keymap_key_repeats(struct xkb_keymap* k, int key) { return 0; }
struct xkb_state* xkb_state_new(struct xkb_keymap* k) { return 0; }
void xkb_state_unref(struct xkb_state* s) {}
struct xkb_keymap* xkb_state_get_keymap(struct xkb_state* s) { return 0; }
int xkb_state_key_get_one_sym(struct xkb_state* s, int key) { return 0; }
int xkb_state_key_get_utf8(struct xkb_state* s, int key, char* buf, size_t sz) { if (buf && sz) buf[0]=0; return 0; }
unsigned int xkb_state_serialize_mods(struct xkb_state* s) { return 0; }
int xkb_state_update_mask(struct xkb_state* s, unsigned int a, unsigned int b, unsigned int c, unsigned int d, unsigned int e, unsigned int f) { return 0; }
struct xkb_compose_table* xkb_compose_table_new_from_locale(struct xkb_context* c, const char* l, int f) { return 0; }
void xkb_compose_table_unref(struct xkb_compose_table* t) {}
struct xkb_compose_state* xkb_compose_state_new(struct xkb_compose_table* t, int f) { return 0; }
void xkb_compose_state_unref(struct xkb_compose_state* s) {}
int xkb_compose_state_feed(struct xkb_compose_state* s, int k) { return 0; }
int xkb_compose_state_get_status(struct xkb_compose_state* s) { return 0; }
int xkb_compose_state_get_utf8(struct xkb_compose_state* s, char* buf, size_t sz) { if (buf && sz) buf[0]=0; return 0; }
void xkb_compose_state_reset(struct xkb_compose_state* s) {}
