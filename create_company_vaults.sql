-- 1. إنشاء جدول الأرصدة الحالية للخزائن الثلاث
CREATE TABLE IF NOT EXISTS company_vaults (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    card_usd_balance NUMERIC NOT NULL DEFAULT 50, -- رصيد البطاقة يبدأ بـ 50 دولار كقيمة أولية
    company_dzd_balance NUMERIC NOT NULL DEFAULT 0, -- خزينة الشركة بالدينار (30% أرباح + رأس مال الإعلانات)
    my_dzd_balance NUMERIC NOT NULL DEFAULT 0, -- الخزينة الشخصية للأدمن بالدينار (70% أرباح)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- إدراج سجل التهيئة الافتراضي للخزائن الثلاث في حال لم يكن موجوداً
INSERT INTO company_vaults (id, card_usd_balance, company_dzd_balance, my_dzd_balance)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 50, 50000, 1500)
ON CONFLICT (id) DO NOTHING;


-- 2. إنشاء جدول كشف وسجل حركات الخزائن الثلاث
CREATE TABLE IF NOT EXISTS vault_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_type TEXT NOT NULL CHECK (vault_type IN ('card', 'company', 'personal')), -- الخزينة المستهدفة
    action_type TEXT NOT NULL CHECK (action_type IN ('buy_usd', 'fb_spend', 'company_expense', 'recharge_income', 'personal_withdraw', 'personal_deposit')),
    amount_dzd NUMERIC NOT NULL DEFAULT 0,
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    exchange_rate NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 3. تفعيل جدار الحماية RLS بالكامل على الجداول للخصوصية المطلقة للأدمن

ALTER TABLE company_vaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only vaults policy" ON company_vaults;
CREATE POLICY "Admin only vaults policy" ON company_vaults FOR ALL
USING (is_admin_session(current_setting('request.headers', true)::json->>'x-session-token'));

ALTER TABLE vault_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only ledger policy" ON vault_ledger;
CREATE POLICY "Admin only ledger policy" ON vault_ledger FOR ALL
USING (is_admin_session(current_setting('request.headers', true)::json->>'x-session-token'));
