/* libXi.so.6 headless stub */
typedef struct { int a; } XDevice; typedef struct { int b; } XDeviceInfo; typedef struct { int c; } XDeviceState;
typedef struct { int d; } XInputClassInfo; typedef struct { int e; } XEvent;
XDevice* XOpenDevice(void* d, int id) { return 0; }
void XCloseDevice(void* d, XDevice* dev) {}
XDeviceInfo* XListInputDevices(void* d, int* n) { if (n) *n = 0; return 0; }
void XFreeDeviceList(XDeviceInfo* l) {}
XDeviceState* XQueryDeviceState(void* d, XDevice* dev, int* n) { if (n) *n = 0; return 0; }
void XFreeDeviceState(XDeviceState* s) {}
int XSelectExtensionEvent(void* d, unsigned long w, int* types, int count) { return 0; }
void* XGetExtensionVersion(void* d, const char* name) { return 0; }
int _XiGetDevicePresenceNotifyEvent(void* d) { return 0; }
