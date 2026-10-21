/**
 * ============================================================================
 * CLASS NEWS — articles written by the Class Parent Reps
 * ============================================================================
 * To add a story: copy one object in NEWS_ARTICLES, give it a unique `id`,
 * put the photo in website/news/ (≈1600px wide JPG), and write the body as
 * an array of paragraphs. Order doesn't matter — newest `date` shows first.
 * Privacy: no student full names and never phone numbers in articles.
 * ============================================================================
 */
const NEWS_ARTICLES = [
  {
    id: 'class-retreat-2026',
    date: '2026-10-21',              // date posted (YYYY-MM-DD)
    title: "Letters, Candlelight and a Parents’ Promise: 11-Escribano Closes Ignatian Retreat",
    deck: "Over two days of silence, prayer and reflection, the Grade 11 class stepped away from routine. On Friday, their parents joined them to share stories of faith, love and the work still unfolding in their children.",
    author: 'By Nom & Kat Hernandez, Class Parent Reps',
    dateline: 'QUEZON CITY',
    photoCredit: 'Photo: 11-Escribano Parents',
    image: 'news/2026-10-retreat-class-cover.jpg',
    imageAlt: 'The 11-Escribano class with their retreat lanyards, gathered in a bright chapel',
    caption: "The Grade 11 Escribano class gathers in the chapel during its Ignatian Class Retreat at the Sacred Heart Novitiate & Retreat House in Novaliches, Quezon City, October 15–16, 2026.",
    excerpt: "Over two days of silence, prayer and reflection, the Grade 11 class stepped away from routine. On Friday, their parents joined them to share stories of faith, love and the work still unfolding in their children.",
    // Body: strings are paragraphs; { photo: { src, alt, caption } } places an inline photo.
    body: [
      "Parents of the Grade 11 Escribano class gathered at the Sacred Heart Novitiate & Retreat House in Novaliches on Friday, October 16, to share heartfelt stories about their children. The Parents’ Session was the emotional high point of the class’s two-day Ignatian Class Retreat.",
      "The October 15–16 retreat, held at the retreat house along KM 23 Quirino Highway, is rooted in the spirituality of St. Ignatius of Loyola and sets aside time for prayer, reflection and discernment. Campus Ministry describes its aim as helping each student grow in “a deeper awareness and relationship with himself, others, and God.”",
      "Two parents spoke at the lectern during Friday’s session.",
      {"photo": {"src": "news/2026-10-retreat-claudine-sharing-v4.jpg", "alt": "Claudine de Leon speaking at the lectern", "caption": "Claudine de Leon, mother of Tyrone, speaks about planting seeds of faith during the Parents’ Session on Friday, October 16."}},
      "Claudine de Leon, mother of Tyrone, spoke about planting seeds of faith in a child, trusting that what parents sow at home will continue to grow.",
      {"photo": {"src": "news/2026-10-retreat-nomerson-sharing-v4.jpg", "alt": "Nomerson Hernandez speaking at the lectern", "caption": "Nomerson Hernandez, father of Theon, shares about his mission as a parent, drawing on Philippians 1:6, at the Parents’ Session."}},
      "Nomerson Hernandez, father of Theon, built his sharing around a question he used to ask his son. When Theon was three and his younger sister Kala was born, Hernandez asked him every time he left for work: “Theon, what is your mission?” The boy always answered, “To protect Kala and Mommy.”",
      "“Looking back, I realize that while I was teaching him about his mission, God was also teaching me about mine,” Hernandez said. As his son nears adulthood, he said, strengthening Theon’s faith also means trusting God more.",
      "“I can guide him. I can listen to him. I can pray for him. But I cannot walk every step of his journey for him,” he said.",
      "Both sharers anchored their reflections in the same verse, Philippians 1:6: “being confident of this, that he who began a good work in you will carry it on to completion until the day of Christ Jesus” (New International Version). The verse captured the morning’s theme: formation does not end with a retreat, but is a work in progress that parents, teachers and God share.",
      "The session was followed by the Retreat Closing Mass and a lunch salu-salo where families and students ate together.",
      "The retreat began Thursday morning with a Send-off Mass at the St. Aloysius Gonzaga Chapel on campus. Throughout the two days, the class was accompanied by Campus Ministers Mr. Nigel Perea and Mr. Kent Sarcol and Class Moderator Ms. Eirenne Lamasang.",
      "Away from classes and screens, the students read letters written for them, journaled by candlelight, worked with modeling clay and prayed in silence in the chapel. Between sessions, they rested under the retreat house’s big trees.",
      "The class parents thank the Campus Ministry team and Ms. Eirenne Lamasang for guiding the students and keeping them safe. They also thank every family who joined on Friday or prayed from wherever they were."
    ],
    galleryLink: 'https://drive.google.com/drive/folders/1cOwicW5Cf2hipfnuIA7gEP1kgMuC-oax',
    gallery: [
      { src: 'news/2026-10-retreat-letters-sofa.jpg', alt: "Boys on a sofa reading letters", caption: "Students settle onto a sofa to read letters written for them." },
      { src: 'news/2026-10-retreat-letters-hall.jpg', alt: "Students quietly reading letters around a hall", caption: "Students find quiet corners around the hall to read their letters in silence." },
      { src: 'news/2026-10-retreat-journaling-candle.jpg', alt: "A student journaling by candlelight", caption: "A student writes in his journal by candlelight during an evening reflection." },
      { src: 'news/2026-10-retreat-clay-modeling.jpg', alt: "Students in green class shirts sculpting with modeling clay", caption: "Students in green class shirts work with modeling clay as part of a reflection activity." },
      { src: 'news/2026-10-retreat-chapel-prayer.jpg', alt: "Two students praying quietly in the chapel", caption: "Two students pray quietly in the retreat house chapel." },
      { src: 'news/2026-10-retreat-grounds-rest.jpg', alt: "Students resting on a swing and bench under big trees", caption: "Students rest on a swing and bench under the big trees on the retreat house grounds." }
    ]
  }
];

(function () {
  const list = document.getElementById('news-list');
  if (!list) return;

  const fmt = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
  const el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // Newspaper-style caption: caption text followed by the photo credit.
  const caption = function (text, credit) {
    const c = el('figcaption', 'news-caption', text);
    if (credit) { c.appendChild(document.createTextNode(' ')); c.appendChild(el('span', 'news-credit', credit)); }
    return c;
  };

  const articles = NEWS_ARTICLES.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  if (!articles.length) {
    list.appendChild(el('p', 'no-results', 'No class news yet. Check back soon!'));
    return;
  }

  articles.forEach(function (a) {
    const art = el('article', 'news-article');
    art.id = a.id;

    if (a.image) {
      const fig = el('figure', 'news-figure');
      const img = el('img', 'news-photo');
      img.src = a.image; img.alt = a.imageAlt || ''; img.loading = 'lazy'; img.decoding = 'async';
      fig.appendChild(img);
      if (a.caption) fig.appendChild(caption(a.caption, a.photoCredit));
      art.appendChild(fig);
    }

    const time = el('time', 'card-date', fmt.format(new Date(a.date + 'T00:00:00+08:00')));
    time.dateTime = a.date;
    art.appendChild(time);
    const h = el('h2', 'news-title');
    const link = el('a', null, a.title); link.href = '#' + a.id;
    h.appendChild(link);
    art.appendChild(h);
    art.appendChild(el('p', 'news-byline', a.author));
    art.appendChild(el('p', 'card-summary news-excerpt', a.excerpt));

    const body = el('div', 'news-body');
    body.id = a.id + '-body';
    body.hidden = true;
    a.body.forEach(function (p, i) {
      if (p && p.photo) {
        const f = el('figure', 'news-inline-figure');
        const im = el('img', 'news-inline-photo');
        im.src = p.photo.src; im.alt = p.photo.alt || ''; im.loading = 'lazy'; im.decoding = 'async';
        f.appendChild(im);
        if (p.photo.caption) f.appendChild(caption(p.photo.caption, a.photoCredit));
        body.appendChild(f);
        return;
      }
      const para = el('p', null, p);
      if (i === 0 && a.dateline) para.insertBefore(el('span', 'news-dateline', a.dateline + ' \u2014 '), para.firstChild);
      body.appendChild(para);
    });
    if (a.gallery && a.gallery.length) {
      const grid = el('div', 'news-gallery');
      a.gallery.forEach(function (g) {
        const b = el('button', 'news-thumb');
        b.type = 'button';
        b.setAttribute('aria-label', 'View photo: ' + (g.caption || g.alt));
        const ti = el('img');
        ti.src = g.src; ti.alt = g.alt || ''; ti.loading = 'lazy'; ti.decoding = 'async';
        b.appendChild(ti);
        b.addEventListener('click', function () { openLightbox(g); });
        const gf = el('figure', 'news-gallery-item');
        gf.appendChild(b);
        if (g.caption) gf.appendChild(caption(g.caption, a.photoCredit));
        grid.appendChild(gf);
      });
      body.appendChild(el('h3', 'news-gallery-title', 'Photos from the retreat'));
      body.appendChild(grid);
    }
    if (a.galleryLink) {
      const more = el('a', 'news-all-photos', 'See all photos');
      more.href = a.galleryLink; more.target = '_blank'; more.rel = 'noopener noreferrer';
      body.appendChild(more);
    }
    art.appendChild(body);

    const btn = el('button', 'read-more-btn news-toggle', 'Read the full story');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', body.id);
    btn.addEventListener('click', function () {
      const open = body.hidden;
      body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Show less' : 'Read the full story';
    });
    art.appendChild(btn);
    list.appendChild(art);
  });

  // Simple lightbox using <dialog>; closes on click, Esc, or the button.
  let box;
  function openLightbox(g) {
    if (!box) {
      box = el('dialog', 'news-lightbox');
      box.innerHTML = '<button type="button" class="news-lightbox-close" aria-label="Close photo">\u00d7</button><img alt=""><p class="news-caption"></p>';
      box.addEventListener('click', function () { box.close(); });
      document.body.appendChild(box);
    }
    box.querySelector('img').src = g.src;
    box.querySelector('img').alt = g.alt || '';
    box.querySelector('p').textContent = g.caption || '';
    box.showModal();
  }

  // Deep link (news.html#id) opens that article.
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) {
    const t = target.querySelector('.news-toggle');
    if (t && t.getAttribute('aria-expanded') === 'false') t.click();
    target.scrollIntoView();
  }
})();
