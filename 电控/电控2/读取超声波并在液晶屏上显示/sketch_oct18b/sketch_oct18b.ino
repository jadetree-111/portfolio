#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// 1. 定义 OLED 屏幕参数
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// 2. 定义超声波传感器引脚（可根据实际接线修改）
const int TRIG_PIN = 13;
const int ECHO_PIN = 12;

void setup() {
  Serial.begin(115200); // 提高串口波特率
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // 初始化 OLED 屏幕（I2C 地址通常为 0x3C）
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;); // 初始化失败则死循环
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.display();
}

void loop() {
  long duration;
  float distance;
  float voltage = 0.0;

  // 1. 产生 10us 的触发脉冲
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // 2. 读取回波高电平持续时间，计算距离（单位：cm）
  duration = pulseIn(ECHO_PIN, HIGH);
  distance = (duration * 0.034) / 2;

  // 3. 串口打印
  Serial.print("distance: ");
  Serial.print(distance);
  Serial.println(" cm");

  // 4. OLED 显示（使用 setCursor 分别定位，避免 println 换行导致显示不全）
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(0, 16);
  display.print("Dist: ");
  display.print(distance);
  display.println(" cm");

  display.setTextSize(1);
  display.setCursor(0, 48);
  display.print("Voltage: ");
  display.print(voltage);
  display.display();

  delay(100);
}
