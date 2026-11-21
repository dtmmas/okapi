package woyou.aidlservice.jiuiv5;

interface ICallback {
  void onRunResult(boolean isSuccess);
  void onReturnString(String value);
  void onRaiseException(int code, String message);
  void onPrintResult(int code, String message);
}
