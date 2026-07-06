# Công cụ tra cứu đơn hàng (10X + SOLOBIZ) — Web app trên Vercel

Web app tra cứu đơn hàng: nhập từng mã (DH… / BIZ…) hoặc upload Excel xử lý hàng loạt.
Backend là serverless function Python trên Vercel.

## Cấu trúc

```
api/_core.py     Logic tra cứu dùng chung (đăng nhập, gọi API, cache token in-memory)
api/index.py     Serverless function duy nhất; phân nhánh theo body.action ("lookup"/"excel")
index.html       Giao diện web (2 tab: tra cứu / Excel), gọi POST /api/index
vercel.json      Legacy builds: build api/index.py (@vercel/python) + index.html (static),
                 route /api/* -> api/index.py, còn lại -> index.html
requirements.txt requests, openpyxl
```

> Ghi chú: gộp thành 1 function `api/index.py` và dùng `@vercel/python@4.8.0` (mô hình
> multi-file cũ) vì runtime Python mới (6.x) đổi sang bắt buộc 1 entrypoint và làm hỏng
> việc phục vụ trang tĩnh khi ghim runtime kiểu zero-config.

## Deploy lên Vercel

1. Đẩy repo này lên GitHub.
2. Vào https://vercel.com → **Add New… → Project** → chọn repo.
3. Framework Preset để **Other** (đã có `vercel.json` cấu hình build + route).
4. Mở **Settings → Environment Variables**, thêm:
   - `LOGIN_EMAIL` — email đăng nhập hệ thống (10X/SOLOBIZ)
   - `LOGIN_PASSWORD` — mật khẩu đăng nhập hệ thống (10X/SOLOBIZ)
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
LOGIN_EMAIL=... LOGIN_PASSWORD=... python -c "from api._core import lookup_order; print(lookup_order('DH18700'))"
```
