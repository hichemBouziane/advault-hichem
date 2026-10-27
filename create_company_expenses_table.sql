-- 1. إنشاء جدول مصاريف الشركة
CREATE TABLE IF NOT EXISTS company_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    amount_dzd NUMERIC NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'أخرى',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. تفعيل السياسات الأمنية (RLS)
ALTER TABLE company_expenses ENABLE ROW LEVEL SECURITY;

-- 3. سياسات الوصول الحر للأدمن (القراءة والرفع والحذف)
CREATE POLICY "Allow anonymous read on company_expenses" ON company_expenses FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert on company_expenses" ON company_expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous delete on company_expenses" ON company_expenses FOR DELETE USING (true);
