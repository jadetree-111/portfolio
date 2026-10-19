#define TRIG 14
#define ECHO 27 
void setup() {
  // put your setup code here, to run once:
  pinMode(TRIG,OUTPUT);
  pinMode(ECHO,INPUT);
  Serial.begin(9600);
}

void loop() {
  // put your main code here, to run repeatedly:
  long duration,distance;
  digitalWrite(TRIG,LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG,HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG,LOW);
  duration = pulseIn(ECHO,HIGH);
  distance = (duration*0.034)/2;
  Serial.print("distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  delay(100);
}
