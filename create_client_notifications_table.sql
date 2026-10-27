-- =========================================================================
--      نظام إشعارات تطبيق الهاتف الذكية (Client Mobile Notifications)
--      محمي بالكامل عبر RLS و x-session-token طبقاً لقواعد الأمان
-- =========================================================================

CREATE TABLE IF NOT EXISTS client_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('low_balance', 'overdue_debt', 'payment_added', 'general')),
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- إنشاء فهرس لتسريع جلب إشعارات العميل غير المقروءة
CREATE INDEX IF NOT EXISTS idx_client_notifications_client_id ON client_notifications(client_id, is_read);

-- 1. تفعيل جدار الحماية RLS
ALTER TABLE client_notifications ENABLE ROW LEVEL SECURITY;

-- 2. سياسة الأمان للقراءة والتعديل والحذف:
-- يسمح للأدمن بإدارة كل الإشعارات، ويسمح للعميل بقراءة وتحديث إشعاراته الخاصة فقط عبر x-session-token
DROP POLICY IF EXISTS "Secure client_notifications select_update_delete" ON client_notifications;
CREATE POLICY "Secure client_notifications select_update_delete" ON client_notifications
FOR ALL
USING (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);

-- 3. سياسة الأمان للإدخال:
-- يسمح للأدمن بإرسال إشعار لأي عميل، أو للنظام بتوليد إشعار تنبيه الرصيد للعميل نفسه
DROP POLICY IF EXISTS "Secure client_notifications insert" ON client_notifications;
CREATE POLICY "Secure client_notifications insert" ON client_notifications
FOR INSERT
WITH CHECK (
    is_admin_session(current_setting('request.headers', true)::json->>'x-session-token')
    OR
    client_id = get_user_id_by_session_token(current_setting('request.headers', true)::json->>'x-session-token')
);
