-- 1. إضافة الأعمدة الجديدة لجدول الخدمات الحالي
ALTER TABLE services ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;

-- 2. إضافة عمود الشريك لجدول طلبات الخدمات الحالي لربط الطلب بصاحب الخدمة
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- 3. إنشاء جدول محفظة أرباح مقدمي الخدمات (الخدماتيين) الشركاء
CREATE TABLE IF NOT EXISTS provider_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    total_requests INT DEFAULT 0,
    completed_requests INT DEFAULT 0,
    rejected_requests INT DEFAULT 0,
    total_revenue_usd NUMERIC DEFAULT 0,
    payout_balance_usd NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. إنشاء جدول طلبات سحب الأرباح المقدمة من الخدماتيين للأدمن
CREATE TABLE IF NOT EXISTS provider_payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    amount_dzd NUMERIC NOT NULL,
    amount_usd NUMERIC NOT NULL,
    payout_method VARCHAR(100) NOT NULL, -- CCP / Baridimob
    payout_details TEXT NOT NULL,         -- رقم الحساب والاسم الكامل
    status VARCHAR(50) DEFAULT 'pending', -- pending / approved / rejected
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- تفعيل ميزة البحث الجغرافي والوصول المفتوح للجداول
ALTER TABLE provider_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access on provider_wallets" ON provider_wallets FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write access on provider_wallets" ON provider_wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on provider_wallets" ON provider_wallets FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous read access on provider_payout_requests" ON provider_payout_requests FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write access on provider_payout_requests" ON provider_payout_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on provider_payout_requests" ON provider_payout_requests FOR UPDATE USING (true);

-- 5. إضافة عمود حفظ معرف التليجرام لمقدمي الخدمات لربط الحساب
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);
