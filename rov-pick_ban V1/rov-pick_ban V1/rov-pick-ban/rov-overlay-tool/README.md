# ROV Draft Pick Overlay Tool

เครื่องมือสำหรับแสดง Draft Pick และ Ban Phase สำหรับเกม Arena of Valor (ROV) แบบ Real-time ผ่าน Web Browser

## Features

- ✅ แสดง Draft Pick แบบ Real-time
- ✅ แสดง Ban Phase พร้อม Effect
- ✅ รองรับ 5 ฮีโร่ต่อทีม (Blue/Red Team)
- ✅ แสดง 4 Ban ต่อทีม
- ✅ **Dropdown พิมพ์ค้นหาได้** - ทุก Pick และ Ban Slot
- ✅ ปรับแต่งชื่อทีม, สกอร์, ชื่อผู้เล่น
- ✅ **ปุ่มสลับชื่อผู้เล่น** - สลับ Position ได้ทันที (1↔️2, 2↔️3, ฯลฯ)
- ✅ ตั้งเวลา Timer แบบ Custom
- ✅ Control Panel ที่ใช้งานง่าย
- ✅ รองรับ 125 ฮีโร่ของ ROV
- ✅ Animation และ Visual Effects สวยงาม
- ⭐ **ใหม่:** ใช้ไอคอนฮีโร่สำหรับ Ban Phase
- ⭐ **ใหม่:** แสดงโลโก้ทีม
- ⭐ **ใหม่:** ปุ่ม Switch Teams (สลับข้อมูลทีมทั้งหมด)
- ⭐ **ใหม่:** Timer นับถอยหลังอัตโนมัติพร้อม Pause/Resume

## ขนาดหน้าจอ Overlay

- ความกว้าง: 1920px
- ความสูง: 1080px (Full HD)
- ขนาดช่องรูปฮีโร่: 240x390 พิกเซล

## การติดตั้ง

### 1. ติดตั้ง Dependencies

```bash
cd rov-overlay-tool
npm install
```

### 2. เตรียมรูปฮีโร่

วางรูปฮีโร่ในโฟลเดอร์ `public/images/heroes/` โดยใช้ชื่อไฟล์ตามชื่อฮีโร่ (**ตัวเล็กทั้งหมด**)

ตัวอย่าง:
```
public/images/heroes/airi.png
public/images/heroes/nakroth.png
public/images/heroes/valhein.png
public/images/heroes/tel'annas.png (ใช้ ' ตามชื่อจริง)
public/images/heroes/azzen'ka.png
public/images/heroes/d'arcy.png
public/images/heroes/y'bneth.png
public/images/heroes/bolt baron.png (มีช่องว่าง)
public/images/heroes/lu bu.png
public/images/heroes/wonder woman.png
```

**สำคัญมาก:** 
- ชื่อไฟล์ต้องเป็น**ตัวเล็กทั้งหมด (lowercase)**
- ขนาดควรเป็น 240x390 พิกเซล

### 3. รัน Server

```bash
npm start
```

หรือใช้ Development mode:

```bash
npm run dev
```

Server จะรันที่ `http://localhost:3000`

## การใช้งาน

### 1. เปิด Control Panel

เปิดเว็บเบราว์เซอร์และไปที่:
```
http://localhost:3000
```

### 2. เลือกฮีโร่ด้วย Searchable Dropdown

**ทุก Dropdown สามารถพิมพ์ค้นหาได้!**

#### วิธีใช้:
1. **คลิกที่ Dropdown** → เปิดรายการ
2. **พิมพ์ชื่อฮีโร่** → เช่น `nak`, `violet`, `tel'annas`
3. **รายการกรอง** → แสดงเฉพาะที่ตรงกับคำค้นหา
4. **เลือก** → คลิกหรือกด Enter
5. **เสร็จ!** → ฮีโร่ถูกเลือกและส่งไปยัง Overlay ทันที

#### Keyboard Shortcuts:
- **พิมพ์** → กรองฮีโร่
- **↓/↑** → เลื่อนเลือก
- **Enter** → ยืนยัน
- **Esc** → ปิด Dropdown

#### Tips:
- พิมพ์แค่บางส่วน: `nak` → nakroth
- ไม่สนตัวเล็ก-ใหญ่: `NAKROTH` = `nakroth`
- คลิก **X** เพื่อล้างการเลือก

### 3. เปิด Overlay

เปิดหน้าต่างใหม่หรือใช้ OBS Browser Source:
```
http://localhost:3000/overlay
```

### 3. ตั้งค่า OBS Studio

1. เพิ่ม Browser Source ใน OBS
2. ใส่ URL: `http://localhost:3000/overlay`
3. กำหนดขนาด: Width: 1920, Height: 1080
4. เปิดใช้งาน "Shutdown source when not visible" (Optional)
5. เปิดใช้งาน "Refresh browser when scene becomes active" (Optional)

### 4. ควบคุม Overlay

ใน Control Panel คุณสามารถ:

#### Match Information
- ตั้งชื่อทัวร์นาเมนต์
- ตั้งชื่อแมตช์

#### Team Settings
- ตั้งชื่อทีม (Blue/Red)
- อัพเดทสกอร์
- ตั้งชื่อผู้เล่นทั้ง 5 คน

#### Draft Pick & Ban
- เลือกฮีโร่สำหรับแต่ละ Slot
- เลือกฮีโร่ที่ถูก Ban
- ล้างการเลือกแต่ละ Slot
- ล้างทั้งหมดด้วยปุ่มเดียว

#### Timer
- ตั้งเวลาในรูปแบบ MM:SS
- อัพเดท Real-time ไปยัง Overlay

## โครงสร้างโปรเจค

```
rov-overlay-tool/
├── server.js                 # Express + Socket.IO Server
├── package.json             # Dependencies
├── data/
│   └── heroes.json          # รายชื่อฮีโร่ทั้งหมด (ตัวเล็ก)
└── public/
    ├── control.html         # หน้า Control Panel
    ├── overlay.html         # หน้า Overlay สำหรับ OBS
    ├── css/
    │   ├── control.css      # Styles สำหรับ Control Panel
    │   └── overlay.css      # Styles สำหรับ Overlay
    ├── js/
    │   ├── control.js       # Logic สำหรับ Control Panel
    │   └── overlay.js       # Logic สำหรับ Overlay
    └── images/
        ├── heroes/          # รูปฮีโร่เต็มตัว (240x390px)
        ├── heroes-icons/    # ⭐ ไอคอนฮีโร่สำหรับ Ban (80x80px)
        └── team-logos/      # ⭐ โลโก้ทีม (200x200px)
```

## รายชื่อฮีโร่ทั้งหมด (125 ตัว)

**ชื่อไฟล์ต้องเป็นตัวเล็กทั้งหมด:**

airi, aleister, alice, allain, amily, annette, aoi, arduin, arum, astrid, ata, aya, azzen'ka, baldum, bijan, billow, biron, bolt baron, bonnie, bright, butterfly, capheny, celica, charlotte, chaugnar, cresht, d'arcy, dextra, diaochan, dirak, dolia, edras, elandorr, elsu, enzo, erin, errol, fennik, flash, florentino, gildur, goverra, grakk, hayate, heino, helen, iggy, ignis, ilumia, ishar, jinna, kahlii, kaine, keera, kilgroth, kriknak, krixi, krizzix, lauriel, laville, liliana, lindis, lorion, lu bu, lumburr, maloch, marja, max, mganga, mina, ming, moren, mortos, murad, nakroth, natalya, omega, omen, ormarr, paine, preyta, qi, quillen, raz, riktor, rouie, rourke, roxie, ryoma, sephera, sinestrea, skud, slimz, stuart, superman, taara, tachi, teemee, teeri, tel'annas, thane, thorne, toro, tulen, valhein, veera, veres, violet, volkath, wiro, wisp, wonder woman, wukong, xeniel, y'bneth, yan, yena, yorn, yue, zanis, zata, zephys, zill, zip, zuka

**ดูรายการแบบละเอียดใน HERO_IMAGES_LIST.md**

## การปรับแต่ง

### เปลี่ยนสี Theme

แก้ไขไฟล์ `public/css/overlay.css`:

```css
/* Blue Team Colors */
.blue-team .pick-slot {
    border-color: #00bfff; /* เปลี่ยนสีขอบ */
}

/* Red Team Colors */
.red-team .pick-slot {
    border-color: #ff4444; /* เปลี่ยนสีขอบ */
}
```

### เปลี่ยนขนาดตัวอักษร

แก้ไขค่า `font-size` ในไฟล์ CSS ตามต้องการ

### เพิ่ม/ลดจำนวน Ban

แก้ไข `server.js` และ HTML files เพื่อเพิ่มหรือลด Ban slots

## Troubleshooting

### รูปฮีโร่ไม่แสดง
- ตรวจสอบว่ารูปอยู่ในโฟลเดอร์ `public/images/heroes/`
- **ตรวจสอบชื่อไฟล์ว่าเป็นตัวเล็กทั้งหมด** (airi.png ไม่ใช่ Airi.png)
- ตรวจสอบ extension ของไฟล์ (ควรเป็น .png)
- รันคำสั่ง `npm run check-heroes` เพื่อเช็ครูปที่หาย

### Overlay ไม่อัพเดท
- Refresh หน้า Overlay
- ตรวจสอบ Console ใน Browser (F12)
- ตรวจสอบว่า Server ยังรันอยู่

### Connection Error
- ตรวจสอบว่า Server รันที่ Port 3000
- ตรวจสอบ Firewall Settings
- ลองเปลี่ยน Port ในไฟล์ `server.js`

## เทคโนโลยีที่ใช้

- **Node.js** - JavaScript Runtime
- **Express.js** - Web Server Framework
- **Socket.IO** - Real-time Communication
- **HTML5/CSS3** - Frontend Interface
- **JavaScript (Vanilla)** - Client-side Logic

## License

MIT License

## สนับสนุน

หากพบปัญหาหรือต้องการแนะนำ Feature เพิ่มเติม สามารถติดต่อได้

---

**สร้างโดย:** ROV Community  
**เวอร์ชัน:** 1.0.0  
**อัพเดทล่าสุด:** 2026
