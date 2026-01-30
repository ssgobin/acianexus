/* ===============================
   GAMIFICAÇÃO – Badges / Conquistas
=============================== */
async function unlockBadge(uid, badge) {
    try {
        if (!cloudOk || !db) return;

        const { doc, getDoc, updateDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const ref = doc(db, "gamification", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        let data = snap.data();
        const badges = data.badges || [];

        if (!badges.includes(badge)) {
            badges.push(badge);
            await updateDoc(ref, { badges });
            document.dispatchEvent(new Event('gamification:updated'));

            if (uid === currentUser?.uid) {
                showGamificationToast(`🏅 Nova conquista`, badge);
            }

            console.log(`[GAMIFICAÇÃO] Badge conquistada: ${badge}`);
        }
    } catch (e) {
        console.warn("[GAMIFICAÇÃO] Falha ao desbloquear badge:", e);
    }
}

// ===============================
// GAMIFICAÇÃO – HUD no topo
// ===============================
(function initGamificationHud() {
    const hud = document.getElementById('gamificationHud');
    if (!hud) return;

    const pointsSpan = hud.querySelector('.gamif-points');
    const levelSpan = hud.querySelector('.gamif-level');

    async function refreshHud() {
        if (!cloudOk || !db || !currentUser) {
            hud.classList.add('hidden');
            return;
        }

        try {
            const { doc, getDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );

            const ref = doc(db, "gamification", currentUser.uid);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                hud.classList.add('hidden');
                return;
            }

            const data = snap.data();
            const pts = data.monthPoints || 0;
            const lvl = data.level || 1;

            pointsSpan.textContent = `⭐ ${pts} pts`;
            levelSpan.textContent = `Nível ${lvl}`;
            hud.classList.remove('hidden');
        } catch (e) {
            console.warn('[Gamificação HUD] Falha ao carregar:', e);
            hud.classList.add('hidden');
        }
    }

    document.addEventListener('auth:changed', refreshHud);
    document.addEventListener('gamification:updated', refreshHud);

    // primeira carga
    setTimeout(refreshHud, 1000);
})();



