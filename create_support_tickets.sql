-- =========================================================================
--      إنشاء جدول تذاكر الدعم الفني وتأمينها بسياسات RLS في قاعدة البيانات
-- =========================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('شحن الرصيد', 'الحملات الإعلانية', 'طلب الخدمات', 'أخرى')),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    admin_reply TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- تفعيل جدار الحماية RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- سياسة الأمان لقراءة وتحديث وحذف التذاكر (الأدمن يرى الجميع، والعميل يرى تذاكره فقط)
DROP POLICY IF EXISTS "Secure support tickets policy" ON support_tickets;
CREATE POLICY "Secure support tickets policy" ON support_tickets FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);

-- سياسة الأمان للإدخال (العملاء يسجلون تذاكرهم بأنفسهم)
DROP POLICY IF EXISTS "Insert support tickets policy" ON support_tickets;
CREATE POLICY "Insert support tickets policy" ON support_tickets FOR INSERT
WITH CHECK (
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);
