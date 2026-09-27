/* Headless stub for libGL.so.1 — Blender headless (bpy) never calls GL;
   symbols exist only to satisfy eager binding of libusd_ms.so. */
typedef struct _XDisplay Display; typedef unsigned long XID;
typedef struct { int a; } FBConfig; typedef struct { int b; } XVisualInfo;
typedef struct __GLXcontextRec* GLXContext;
typedef XID GLXDrawable; typedef XID GLXWindow; typedef XID GLXPbuffer;
void glFinish(void) {}
void glFlush(void) {}
unsigned int glGetError(void) { return 0; }
const unsigned char* glGetString(unsigned int name) { return 0; }
void glGetIntegerv(unsigned int pname, int* params) { if (params) *params = 0; }
void* glXGetProcAddress(const unsigned char* proc) { return 0; }
void* glXGetProcAddressARB(const unsigned char* proc) { return 0; }
FBConfig* glXChooseFBConfig(Display* d, int s, const int* a, int* n) { if (n) *n = 0; return 0; }
int glXGetFBConfigAttrib(Display* d, FBConfig* c, int a, int* v) { if (v) *v = 0; return 0; }
XVisualInfo* glXGetVisualFromFBConfig(Display* d, FBConfig* c) { return 0; }
XVisualInfo* glXChooseVisual(Display* d, int s, int* a) { return 0; }
GLXContext glXCreateContext(Display* d, XVisualInfo* v, GLXContext s, int direct) { return 0; }
GLXContext glXCreateNewContext(Display* d, FBConfig* c, int rt, GLXContext s, int direct) { return 0; }
GLXContext glXGetCurrentContext(void) { return 0; }
Display* glXGetCurrentDisplay(void) { return 0; }
GLXDrawable glXGetCurrentDrawable(void) { return 0; }
int glXMakeCurrent(Display* d, GLXDrawable w, GLXContext c) { return 0; }
int glXMakeContextCurrent(Display* d, GLXDrawable w, GLXDrawable r, GLXContext c) { return 0; }
void glXDestroyContext(Display* d, GLXContext c) {}
int glXQueryContext(Display* d, GLXContext c, int attr, int* v) { if (v) *v = 0; return 0; }
void glXSwapBuffers(Display* d, GLXDrawable w) {}
GLXWindow glXCreateWindow(Display* d, FBConfig* c, GLXDrawable w, const int* a) { return 0; }
void glXDestroyWindow(Display* d, GLXWindow w) {}
void glXUseXFont(unsigned long font, int first, int count, int list) {}
int glXQueryExtension(Display* d, int* e, int* v) { return 0; }
int glXQueryVersion(Display* d, int* ma, int* mi) { return 0; }
int glXIsDirect(Display* d, GLXContext c) { return 0; }
GLXPbuffer glXCreatePbuffer(Display* d, FBConfig* c, const int* a) { return 0; }
void glXDestroyPbuffer(Display* d, GLXPbuffer p) {}
/* legacy GL1 symbols needed by Qt5Gui (opencv-contrib headless import) */
void glLoadIdentity(void) {}
void glLoadMatrixf(const float* m) {}
void glMatrixMode(unsigned int mode) {}
void glOrtho(double l, double r, double b, double t, double n, double f) {}
