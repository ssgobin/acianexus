/* =========================================
   GAMIFICAÇÃO – Upgrade automático de nível
========================================= */
async function applyLevelUp(uid) {
    if (!cloudOk || !db) return;

    const { doc, getDoc, updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );

    const ref = doc(db, "gamification", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    let data = snap.data();
    const pts = data.monthPoints || 0;

    let newLevel = data.level || 1;
    for (let i = GAMIF_LEVEL_REQS.length - 1; i >= 0; i--) {
        if (pts >= GAMIF_LEVEL_REQS[i]) {
            newLevel = i + 1;
            break;
        }
    }

    if (newLevel !== data.level) {
        await updateDoc(ref, { level: newLevel });
        document.dispatchEvent(new Event('gamification:updated'));

        if (uid === currentUser?.uid) {
            showGamificationToast(`⬆️ Nível ${newLevel}`, 'Subiu de nível!');
        }

        console.log(`[GAMIFICAÇÃO] ${uid} subiu para nível ${newLevel}`);
    }
}

