/* libXt.so.6 headless stub (incl. data symbols) */
typedef struct _WidgetClassRec* WidgetClass; typedef struct _WidgetRec* Widget; typedef struct _XDisplay Display;
struct _XtStringRec { const char* a; };
WidgetClass applicationShellWidgetClass = 0;
WidgetClass topLevelShellWidgetClass = 0;
const char* XtStrings = 0;
Widget XtOpenApplication(void* app, const char* cls, int* argc, char** argv, void* fallback, void* opts, int num, void** w, WidgetClass c, void* args, int n) { return 0; }
void XtDestroyWidget(Widget w) {}
Display* XtDisplay(Widget w) { return 0; }
void XtRealizeWidget(Widget w) {}
void XtUnrealizeWidget(Widget w) {}
unsigned long XtWindow(Widget w) { return 0; }
Widget XtCreatePopupShell(const char* n, WidgetClass c, Widget p, void* args, int num) { return 0; }
