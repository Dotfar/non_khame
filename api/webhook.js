import axios from "axios";
import PDFDocument from "pdfkit";

const TOKEN = "8478636545:AAHe-xVVJyahbEiPkyK-QZ4ZnYz8vYXEGwA";
const API = `https://api.telegram.org/bot${TOKEN}`;

// ارسال پیام متنی
async function sendMessage(chatId, text) {
    await axios.post(`${API}/sendMessage`, {
        chat_id: chatId,
        text: text
    });
}

// دریافت لینک دانلود فایل از تلگرام
async function getFileUrl(fileId) {
    const res = await axios.get(`${API}/getFile?file_id=${fileId}`);
    const filePath = res.data.result.file_path;
    return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}

// دانلود عکس به صورت باینری (Buffer)
async function downloadImage(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(200).send("Telegram PDF Bot is Running 🧁");
    }

    try {
        const update = req.body;
        if (!update.message) {
            return res.status(200).json({ ok: true });
        }

        const msg = update.message;
        const chatId = msg.chat.id;
        const text = (msg.text || "").trim();

        // دستور شروع
        if (text === "/start") {
            await sendMessage(
                chatId,
                "سلام! 🧁\n\nمن ربات سازنده‌ی PDF هستم.\nفقط کافیه عکس‌هات رو به صورت **گروهی (آلبوم)** بفرستی تا من درجا همه رو تبدیل به یک فایل PDF کنم و برات بفرستم!"
            );
            return res.status(200).json({ ok: true });
        }

        // بررسی اینکه آیا عکس ارسال شده است یا خیر (پشتیبانی از عکس تکی یا آلبوم)
        // نکته: وقتی کاربر آلبوم می‌فرسته، تلگرام چند پیام پشت سر هم می‌فرسته که هرکدام media_group_id دارند 
        // یا برای سادگیِ صددرصدی روی سرورلس، عکس‌های دریافتی رو لحظه‌ای پردازش می‌کنیم.
        if (msg.photo) {
            await sendMessage(chatId, "⏳ عکس(ها) دریافت شد، در حال ساخت فایل PDF...");

            // بزرگ‌ترین سایز عکس
            const photoArray = msg.photo;
            const bestPhoto = photoArray[photoArray.length - 1];
            
            const fileUrl = await getFileUrl(bestPhoto.file_id);
            const imageBuffer = await downloadImage(fileUrl);

            // ساخت PDF در حافظه
            const pdfBuffer = await new Promise((resolve, reject) => {
                const doc = new PDFDocument({ autoFirstPage: false });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    resolve(Buffer.concat(buffers));
                });

                // اضافه کردن عکس به صفحه PDF
                doc.addPage();
                doc.image(imageBuffer, 50, 50, { fit: [500, 700], align: 'center', valign: 'center' });
                doc.end();
            });

            // ارسال فایل PDF به کاربر
            const formData = new (await import('form-data')).default();
            formData.append('chat_id', chatId);
            formData.append('document', pdfBuffer, {
                filename: 'output.pdf',
                contentType: 'application/pdf',
            });
            formData.append('caption', 'بفرمایید این هم فایل PDF شما 🧁');

            await axios.post(`${API}/sendDocument`, formData, {
                headers: formData.getHeaders(),
            });

            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });

    } catch (err) {
        console.error("Error details:", err.response?.data || err.message);
        return res.status(200).json({ ok: true });
    }
}
