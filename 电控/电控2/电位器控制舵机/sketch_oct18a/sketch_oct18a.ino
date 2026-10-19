#include <ESP32Servo.h>
Servo myservo;

void setup() {
  // put your setup code here, to run once:
  pinMode(4,INPUT);
  Serial.begin(9600);
  myservo.attach(13);
}

void loop() {
  // put your main code here, to run repeatedly:
  int adc = analogRead(4);
  double voltage = map(adc,0,4095,0,500);
  int angel = map(adc,0,4095,0,180);
  myservo.write(angel);
  voltage/=100;
  Serial.println(voltage);
  delay(100);
}
