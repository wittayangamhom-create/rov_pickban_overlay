# วิธีติดตั้ง ROV Overlay Tool

คู่มือนี้สำหรับคนที่อยากเอาไปใช้กับรายการอื่นแบบเร็วที่สุด

## ข้อกำหนดสำคัญ

เครื่องมือนี้ใช้งานฟรี แต่ห้ามนำไปขาย ขายต่อ ให้เช่า รวมในแพ็กเกจเสียเงิน หรืออ้างว่าเป็นแอพของตัวเอง

ตอนเปิดแอพครั้งแรกจะมีหน้าต่างให้กด `I Agree` เพื่อยอมรับเงื่อนไขนี้

## วิธีที่ 1: ใช้ไฟล์ Portable.exe

เหมาะที่สุดสำหรับทีมงานทั่วไป

1. ดาวน์โหลดไฟล์ `ROV-Overlay-Tool-Portable.exe`
2. ดับเบิลคลิกเปิดไฟล์
3. ถ้า Windows SmartScreen เตือน ให้กด `More info` แล้ว `Run anyway`
4. หน้า Control Panel จะเปิดขึ้นมา
5. เอา URL overlay ไปใส่ OBS

URL ที่ใช้บ่อย:

```text
Overlay 1080p: http://127.0.0.1:3000/overlay
Overlay 1440p: http://127.0.0.1:3000/overlay-1440
Result:        http://127.0.0.1:3000/result
```

## วิธีที่ 2: ใช้จาก source code

เหมาะสำหรับคนที่อยากแก้ไฟล์เอง

1. ติดตั้ง Node.js LTS จาก `https://nodejs.org`
2. เปิด PowerShell ในโฟลเดอร์โปรเจกต์
3. รัน:

```powershell
npm.cmd install
npm.cmd run app
```

ถ้าจะรันเป็นเว็บอย่างเดียว:

```powershell
npm.cmd start
```

แล้วเปิด:

```text
http://127.0.0.1:3000/
```

## ถ้า PowerShell ฟ้อง npm.ps1

ใช้ `npm.cmd` แทน `npm`:

```powershell
npm.cmd run app
```

หรือแก้ policy เฉพาะผู้ใช้:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## สร้างไฟล์ .exe เอง

สร้าง Portable:

```powershell
npm.cmd run portable
```

สร้างตัวติดตั้งและ portable:

```powershell
npm.cmd run dist
```

ไฟล์จะอยู่ใน:

```text
dist/
```

## ใช้กับ OBS

เพิ่ม `Browser Source`

1080p:

```text
URL:    http://127.0.0.1:3000/overlay
Width:  1920
Height: 1080
```

1440p:

```text
URL:    http://127.0.0.1:3000/overlay-1440
Width:  2560
Height: 1440
```

เปิดตัวเลือกนี้ได้ถ้าต้องการ:

```text
Refresh browser when scene becomes active
```

## แก้ปัญหาเบื้องต้น

ถ้า OBS ไม่ขึ้น:

1. เช็กว่าแอพยังเปิดอยู่
2. ลองเปิด `http://127.0.0.1:3000/overlay` ใน browser
3. ปิดแล้วเปิดแอพใหม่
4. ถ้า port 3000 ถูกใช้โดยโปรแกรมอื่น ให้ปิดโปรแกรมนั้นก่อน

ถ้ารูปฮีโร่ไม่ขึ้น:

1. เช็กไฟล์ใน `public/images/heroes/`
2. ชื่อใน `data/heroes.json` ต้องตรงกับชื่อไฟล์รูป
3. นามสกุลควรเป็น `.png`, `.jpg`, `.jpeg`, หรือ `.webp`
