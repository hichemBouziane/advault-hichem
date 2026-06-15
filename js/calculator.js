function calculateInstantProfits() {
    const amountInput = document.getElementById('amount').value;
    const amount = parseFloat(amountInput);

    // التحقق من صحة الرقم المدخل
    if (!amount || amount <= 0) {
        alert("يرجى إدخال مبلغ صحيح أولاً.");
        return;
    }

    // تطبيق المعادلات الحسابية
    const adCapital = amount * FINANCIAL_CONFIG.capitalMultiplier;
    const totalProfit = amount - adCapital;
    const companyProfit = totalProfit * FINANCIAL_CONFIG.companyShare;
    const myProfit = totalProfit * FINANCIAL_CONFIG.myShare;

    // عرض المخرجات
    document.getElementById('res-total').innerText = amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
    document.getElementById('res-capital').innerText = adCapital.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
    document.getElementById('res-profit').innerText = totalProfit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
    document.getElementById('res-company').innerText = companyProfit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
    document.getElementById('res-my').innerText = myProfit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";

    // إظهار صندوق النتائج
    document.getElementById('results-box').classList.remove('hidden');
}

// تشغيل الحساب عند الضغط على Enter
document.getElementById('amount').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        calculateInstantProfits();
    }
});
