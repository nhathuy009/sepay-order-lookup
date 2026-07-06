# Công cụ tra cứu đơn hàng (10X + SOLOBIZ) — Web app trên Vercel

Web app tra cứu đơn hàng: nhập từng mã (DH… / BIZ…) hoặc upload Excel xử lý hàng loạt.
Backend là các serverless function Python trên Vercel.

## Cấu trúc

```
api/_core.py     Logic tra cứu dùng chung (đăng nhập, gọi API, cache token in-memory)
api/lookup.py    Serverless function: tra cứu 1 mã đơn
api/excel.py     Serverless function: xử lý file Excel hàng loạt
index.html       Giao diện web (2 tab: tra cứu / Excel)
vercel.json      Cấu hình (maxDuration cho function)
requirements.txt requests, openpyxl
```

## Deploy lên Vercel

1. Đẩy repo này lên GitHub.
2. Vào https://vercel.com → **Add New… → Project** → chọn repo.
3. Framework Preset để **Other** (Vercel tự nhận `api/*.py` + `index.html`).
4. Mở **Settings → Environment Variables**, thêm:
   - `SEPAY_EMAIL` — email đăng nhập hệ thống
   - `SEPAY_PASSWORD` — mật khẩu đăng nhập hệ thống
   - `APP_ACCESS_TOKEN` — mật khẩu bảo vệ truy cập web app (khuyến nghị)
5. **Deploy**. Xong sẽ có URL dạng `https://<project>.vercel.app`.

> Sau khi thêm/đổi Environment Variables phải **Redeploy** để có hiệu lực.

## Bảo mật

- App có URL công khai → **bắt buộc** nên đặt `APP_ACCESS_TOKEN` để tránh lộ dữ liệu
  đơn hàng/khách hàng. Nếu để trống, ai có link cũng tra cứu được.
- Không hardcode email/mật khẩu trong code — luôn dùng Environment Variables.
- Khuyến nghị đổi mật khẩu hệ thống vì mật khẩu cũ đã từng lộ trong chat/script.

## Chạy thử local

```bash
npm i -g vercel
vercel dev          # tạo file .env từ .env.example trước
```

Hoặc chỉ test logic:

```bash
pip install -r requirements.txt
SEPAY_EMAIL=... SEPAY_PASSWORD=... python -c "from api._core import lookup_order; print(lookup_order('DH18700'))"
```
