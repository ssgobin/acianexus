(() => {
    const ICON_MAP = {
        activity: 'fa-chart-line',
        'alert-octagon': 'fa-circle-exclamation',
        'alert-circle': 'fa-circle-exclamation',
        'alert-triangle': 'fa-triangle-exclamation',
        'arrow-left': 'fa-arrow-left',
        'arrow-right': 'fa-arrow-right',
        'bar-chart-2': 'fa-chart-column',
        bell: 'fa-bell',
        calendar: 'fa-calendar-days',
        'calendar-days': 'fa-calendar-days',
        'calendar-check': 'fa-calendar-check',
        'check-circle': 'fa-circle-check',
        'check-circle-2': 'fa-circle-check',
        check: 'fa-check',
        'check-square': 'fa-square-check',
        'chevron-down': 'fa-chevron-down',
        'chevron-left': 'fa-chevron-left',
        'chevron-right': 'fa-chevron-right',
        clipboard: 'fa-clipboard',
        'clipboard-list': 'fa-clipboard-list',
        clock: 'fa-clock',
        download: 'fa-download',
        'edit-2': 'fa-pen-to-square',
        eye: 'fa-eye',
        'eye-off': 'fa-eye-slash',
        'file-text': 'fa-file-lines',
        hash: 'fa-hashtag',
        inbox: 'fa-inbox',
        info: 'fa-circle-info',
        kanban: 'fa-table-columns',
        'layout-dashboard': 'fa-gauge-high',
        list: 'fa-list',
        'loader-2': 'fa-spinner',
        lock: 'fa-lock',
        'log-out': 'fa-right-from-bracket',
        map: 'fa-map',
        'map-pin': 'fa-location-dot',
        megaphone: 'fa-bullhorn',
        menu: 'fa-bars',
        'message-square': 'fa-message',
        moon: 'fa-moon',
        pause: 'fa-pause',
        'pause-circle': 'fa-circle-pause',
        play: 'fa-play',
        'play-circle': 'fa-circle-play',
        plus: 'fa-plus',
        'refresh-cw': 'fa-rotate-right',
        repeat: 'fa-repeat',
        save: 'fa-floppy-disk',
        search: 'fa-magnifying-glass',
        send: 'fa-paper-plane',
        settings: 'fa-gear',
        'shield-check': 'fa-shield-halved',
        star: 'fa-star',
        sun: 'fa-sun',
        ticket: 'fa-ticket',
        'trash-2': 'fa-trash-can',
        user: 'fa-user',
        'user-check': 'fa-user-check',
        'user-plus': 'fa-user-plus',
        'user-x': 'fa-user-xmark',
        users: 'fa-users',
        x: 'fa-xmark',
        'x-circle': 'fa-circle-xmark',
    };

    function toFaClasses(iconName) {
        const raw = String(iconName || '').trim();
        if (!raw) return ['fa-solid', 'fa-circle'];

        // Allow directly passing Font Awesome class names.
        if (raw.startsWith('fa-')) return ['fa-solid', raw];

        const mapped = ICON_MAP[raw] || ICON_MAP[raw.replace(/-2$/, '')] || 'fa-circle';
        return ['fa-solid', mapped];
    }

    function renderIcons(root = document) {
        const nodes = root.querySelectorAll('[data-fa-icon]');
        nodes.forEach((el) => {
            const iconName = el.getAttribute('data-fa-icon');
            const keep = Array.from(el.classList).filter((c) => !c.startsWith('fa-'));
            el.className = [...keep, ...toFaClasses(iconName)].join(' ');

            // Preserve old Lucide sizing (width/height) by mapping to font-size.
            if (!el.style.fontSize) {
                const size = el.style.width || el.style.height;
                if (size) el.style.fontSize = size;
            }

            el.setAttribute('aria-hidden', 'true');
        });
    }

    window.renderIcons = renderIcons;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => renderIcons());
    } else {
        renderIcons();
    }
})();
