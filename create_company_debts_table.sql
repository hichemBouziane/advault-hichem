-- 1. إنشاء جدول الديون والالتزامات للشركة
CREATE TABLE IF NOT EXISTS company_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('علي', 'لي')),
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    amount_dzd NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'غير مقضي' CHECK (status IN ('غير مقضي', 'مقضي')),
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. تفعيل السياسات الأمنية (RLS)
ALTER TABLE company_debts ENABLE ROW LEVEL SECURITY;

-- 3. سياسات الوصول الحر للأدمن (القراءة والرفع والتحديث والحذف)
CREATE POLICY "Allow anonymous read on company_debts" ON company_debts FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert on company_debts" ON company_debts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update on company_debts" ON company_debts FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete on company_debts" ON company_debts FOR DELETE USING (true);
