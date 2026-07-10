// api/invoice.js
const MatBaoInvoice = require('@redonvn/matbao-invoice-sdk');

export default async function handler(req, res) {
    // Chỉ nhận method POST giống chuẩn bạn đang làm ở file Python
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Lấy thông tin chứng thực từ Environment Variables trên Vercel
        // (Bạn nhớ lên giao diện Vercel thêm các biến này nhé)
        const client = new MatBaoInvoice({
            apiKey: process.env.MATBAO_API_KEY, 
            apiSecret: process.env.MATBAO_API_SECRET
        });

        // Đọc payload từ frontend gửi lên
        const body = req.body;
        
        // --- VIẾT LOGIC XỬ LÝ HÓA ĐƠN Ở ĐÂY ---
        // Ví dụ: const result = await client.createInvoice(body.invoiceData);

        // Trả kết quả về cho Frontend
        res.status(200).json({
            success: true,
            message: "Đã gọi thành công vào SDK Mắt Bão",
            data: body // Thay bằng kết quả thực tế
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
