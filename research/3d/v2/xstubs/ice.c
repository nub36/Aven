/* libICE.so.6 headless stub */
int IceAddConnectionWatch(int (*f)(void*, void*, int), void* d) { return 0; }
void IceRemoveConnectionWatch(int (*f)(void*, void*, int), void* d) {}
int IceConnectionNumber(void* ice) { return -1; }
int IceProcessMessages(void* ice) { return 0; }
void IceSetShutdownNegotiation(void* ice, int n) {}
int IceCheckShutdownNegotiation(void* ice) { return 0; }
