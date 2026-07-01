# ROV Pick/Ban Overlay Tool

[![Platform](https://img.shields.io/badge/platform-Windows-2563eb)](https://github.com/wittayangamhom-create/rov_pickban_overlay)
[![OBS](https://img.shields.io/badge/OBS-Browser%20Source-7c3aed)](https://obsproject.com/)
[![License](https://img.shields.io/badge/license-Free%20Non--Commercial-ef4444)](LICENSE.md)
[![Release](https://img.shields.io/badge/download-Releases-16a34a)](https://github.com/wittayangamhom-create/rov_pickban_overlay/releases)

ROV Pick/Ban Overlay Tool คือแอพสำหรับทำหน้าจอ Draft Pick / Ban ของเกม ROV เพื่อใช้กับ OBS, งานถ่ายทอดสด, รายการชุมชน, ทัวร์นาเมนต์เล็ก-กลาง และทีมงานที่ต้องการ overlay ใช้งานง่ายโดยไม่ต้องเขียนโค้ดเอง

โปรเจกต์นี้แจกให้ใช้งานฟรี แต่ห้ามนำไปขาย ขายต่อ ให้เช่า รวมในแพ็กเกจเสียเงิน หรืออ้างว่าเป็นผลงานของตัวเอง

## ดาวน์โหลดสำหรับผู้ใช้ทั่วไป

ถ้าคุณต้องการใช้งานอย่างเดียว ให้ดาวน์โหลดไฟล์ `.exe` จากหน้า Releases:

[Download from GitHub Releases](https://github.com/wittayangamhom-create/rov_pickban_overlay/releases)

แนะนำให้โหลดไฟล์ใดไฟล์หนึ่ง:

```text
ROV Overlay Tool Setup 1.0.0.exe
```

หรือแบบพกพา:

```text
ROV-Overlay-Tool-Portable.exe
```

ผู้ใช้ทั่วไปไม่จำเป็นต้องติดตั้ง Node.js, npm, JavaScript หรือ Electron เพิ่ม ตัว `.exe` รวมสิ่งที่จำเป็นไว้แล้ว

## จุดเด่น

- Control Panel สำหรับควบคุมทีม, ผู้เล่น, score, pick, ban และ timer
- Overlay สำหรับ OBS แบบ 1920x1080
- Overlay แยกสำหรับ 2560x1440
- หน้า Result สำหรับสรุป draft
- ค้นหาฮีโร่ด้วยการพิมพ์
- สลับ hero pick ได้โดยไม่สลับชื่อผู้เล่น
- ตั้งชื่อรายการ, match title, เกม, BO และข้อมูลทีมได้
- รองรับรูปฮีโร่สำหรับ pick/ban และ result
- เปิดเป็นแอพ Windows ด้วย Electron
- มีระบบยืนยันเงื่อนไขการใช้งานก่อนเข้าแอพ

## หน้าใช้งานหลัก

เมื่อเปิดแอพแล้ว ระบบจะรัน server ที่เครื่องของคุณ:

```text
Control Panel:  http://127.0.0.1:3000/
Overlay 1080p:  http://127.0.0.1:3000/overlay
Overlay 1440p:  http://127.0.0.1:3000/overlay-1440
Result:         http://127.0.0.1:3000/result
```

ในตัวแอพสามารถเปิดหน้า Overlay และ Result ได้จากเมนู `ROV Tool`

## ใช้กับ OBS

เพิ่ม `Browser Source` ใน OBS แล้วใส่ URL ตามขนาดงาน

สำหรับ 1080p:

```text
URL:    http://127.0.0.1:3000/overlay
Width:  1920
Height: 1080
```

สำหรับ 1440p:

```text
URL:    http://127.0.0.1:3000/overlay-1440
Width:  2560
Height: 1440
```

อ่านรายละเอียดเพิ่มได้ที่:

```text
docs/OBS_SETUP.md
```

## วิธีใช้จาก source code

สำหรับคนที่ต้องการแก้ไขหรือ build เอง

ติดตั้ง Node.js LTS ก่อน จากนั้นรัน:

```powershell
npm.cmd install
npm.cmd run app
```

ถ้าต้องการรันเป็น web server อย่างเดียว:

```powershell
npm.cmd start
```

## Build เป็นไฟล์ .exe

สร้างไฟล์ portable:

```powershell
npm.cmd run portable
```

สร้างทั้งตัวติดตั้งและ portable:

```powershell
npm.cmd run dist
```

ไฟล์ build จะอยู่ใน:

```text
dist/
```

มีไฟล์ช่วยกดรันบน Windows:

```text
START_APP.cmd
BUILD_PORTABLE_EXE.cmd
BUILD_SETUP_EXE.cmd
```

## โครงสร้างโปรเจกต์

```text
data/                       รายชื่อฮีโร่และข้อมูลเริ่มต้น
docs/                       คู่มือเพิ่มเติม
public/                     หน้าเว็บ, overlay, css, js, รูป
public/images/heroes/       รูปฮีโร่
server.js                   server หลัก
electron-main.js            ตัวเปิดแอพ Electron
package.json                scripts และ dependencies
LICENSE.md                  เงื่อนไขการใช้งาน
INSTALL.md                  คู่มือติดตั้งแบบสั้น
```

## การปรับแต่ง

เปลี่ยนรูปฮีโร่:

```text
public/images/heroes/
```

แก้รายชื่อฮีโร่:

```text
data/heroes.json
```

แก้หน้าตา overlay:

```text
public/css/overlay.css
public/css/overlay-1440.css
public/css/result.css
```

ดูรายละเอียดเพิ่ม:

```text
docs/CUSTOMIZE.md
```

## License

โปรเจกต์นี้ใช้ license แบบ Free Non-Commercial

อนุญาตให้:

- ใช้งานฟรี
- แจกต่อฟรี
- ใช้กับรายการแข่ง, งานชุมชน, งานเรียน, งานถ่ายทอดสดที่ไม่ขายตัวแอพ
- แก้ไข source code เพื่อใช้งานเอง

ไม่อนุญาตให้:

- ขายแอพนี้
- ขายต่อหรือให้เช่า
- รวมในแพ็กเกจเสียเงิน
- เก็บเงินเพื่อให้เข้าถึงแอพ
- ลบเครดิตหรืออ้างว่าเป็นผลงานของตัวเอง

อ่านรายละเอียดเต็มได้ที่:

```text
LICENSE.md
```

## หมายเหตุเรื่องทรัพย์สินทางปัญญา

เครื่องมือนี้เป็นระบบ overlay และ control panel เท่านั้น ชื่อเกม, รูปฮีโร่, โลโก้, artwork และ asset อื่นๆ เป็นสิทธิ์ของเจ้าของเดิม ผู้ใช้งานควรตรวจสอบสิทธิ์การใช้ asset ก่อนนำไปเผยแพร่หรือใช้ในงานเชิงพาณิชย์

## Repository Description

ถ้าต้องการใส่คำอธิบายสั้นๆ ในช่อง About ของ GitHub ใช้ข้อความนี้ได้:

```text
Free non-commercial ROV pick/ban overlay tool for OBS, with Windows app, 1080p/1440p overlays, draft timer, hero search, and result screen.
```
