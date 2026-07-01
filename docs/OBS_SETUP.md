# ตั้งค่า OBS

## Overlay 1080p

เพิ่ม Source:

```text
Source Type: Browser
URL:         http://127.0.0.1:3000/overlay
Width:       1920
Height:      1080
```

เหมาะกับ canvas 1920x1080

## Overlay 1440p

เพิ่ม Source:

```text
Source Type: Browser
URL:         http://127.0.0.1:3000/overlay-1440
Width:       2560
Height:      1440
```

เหมาะกับ canvas 2560x1440

## Result

```text
URL:    http://127.0.0.1:3000/result
Width:  1920
Height: 1080
```

## คำแนะนำ

- เปิดแอพหรือ server ก่อนเปิด OBS scene
- ถ้า overlay ไม่อัปเดต ให้คลิกขวา Browser Source แล้ว Refresh
- ถ้าใช้หลายเครื่อง ต้องให้เครื่อง OBS เข้าถึง IP ของเครื่องที่รันแอพได้
- ถ้าใช้เครื่องเดียวกัน แนะนำใช้ `127.0.0.1`
