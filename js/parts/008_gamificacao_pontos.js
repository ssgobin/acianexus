/* ===============================
   GAMIFICAÇÃO – Pontos
=============================== */
async function givePoints(uid, amount, reason = '') {
    if (!uid || !amount) return;
    if (!cloudOk || !db) return;

    try {
        const { doc, getDoc, setDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const ref = doc(db, "gamification", uid);
        const snap = await getDoc(ref);

        let base = snap.exists() ? snap.data() : {
            points: 0,
            monthPoints: 0,
            level: 1,
            badges: [],
            lastUpdated: new Date().toISOString()
        };

        base.points += amount;
        base.monthPoints += amount;
        base.lastUpdated = new Date().toISOString();
        if (reason) base.lastReason = reason;

        await setDoc(ref, base);

        // avisa HUD/Ranking
        document.dispatchEvent(new Event('gamification:updated'));

        // toast só pro próprio usuário
        if (uid === currentUser?.uid) {
            showGamificationToast(`+${amount} pontos`, reason || '');
        }

        console.log(`[GAMIFICAÇÃO] +${amount} pontos para ${uid} (${reason})`);
    } catch (e) {
        console.warn("[GAMIFICAÇÃO] Falha ao adicionar pontos:", e);
    }
}

