-- 1. إنشاء جدول الرسائل والمحادثات
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. تفعيل السياسات الأمنية للوصول للمحادثات
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access on chat_messages" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write access on chat_messages" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on chat_messages" ON chat_messages FOR UPDATE USING (true);
