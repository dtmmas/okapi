package woyou.aidlservice.jiuiv5;

import woyou.aidlservice.jiuiv5.ICallback;
import android.graphics.Bitmap;

interface IWoyouService {
  // SUNMI printerlibrary 1.0.24 Binder codes minus FIRST_CALL_TRANSACTION.
  // Keep explicit offsets: this interface omits unused vendor methods.
  void printerInit(ICallback callback) = 3;
  void lineWrap(int lines, ICallback callback) = 9;
  void sendRAWData(in byte[] data, ICallback callback) = 10;
  void setAlignment(int alignment, ICallback callback) = 11;
  void setFontSize(float fontSize, ICallback callback) = 13;
  void printText(String text, ICallback callback) = 14;
  void printBitmap(in Bitmap bitmap, ICallback callback) = 17;
  void printOriginalText(String text, ICallback callback) = 20;
  void cutPaper(ICallback callback) = 32;
}
