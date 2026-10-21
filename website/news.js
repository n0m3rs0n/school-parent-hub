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
    title: 'Letters, Candlelight and Quiet Prayer: Our 11-Escribano Class Retreat',
    author: 'Posted by Nom & Kat, Class Parent Reps',
    image: 'news/2026-10-retreat-class-cover.jpg',
    imageAlt: 'The 11-Escribano class with their retreat lanyards, gathered in a bright chapel',
    caption: 'The 11-Escribano class together in the chapel.',
    excerpt: 'On October 15\u201316, our kids set aside classes and screens for their Ignatian Class Retreat at the Sacred Heart Novitiate in Novaliches: two days of letters, candlelit reflection, clay, quiet prayer and rest.',
    body: [
      'Dear fellow 11-Escribano parents,',
      'Last Thursday and Friday, October 15\u201316, our children stepped away from their usual school routine for their Ignatian Class Retreat at the Sacred Heart Novitiate & Retreat House along Quirino Highway in Novaliches, Quezon City. Rooted in the spirituality of St. Ignatius of Loyola, the retreat is a required formation experience for every ASHS student, a time for prayer, reflection, and discernment.',
      'The retreat opened with a Send-off Mass on Thursday morning at the St. Aloysius Gonzaga Chapel on campus. Throughout the two days, the class was accompanied by Campus Ministers Mr. Nigel Perea and Mr. Kent Sarcol, together with our Class Moderator, Ms. Lumasang. Thank you for guiding our kids and keeping them safe.',
      'The photos tell a lovely story. Our kids sat with letters written for them, some curled up on a sofa, others in a quiet corner of the hall. As evening fell, they journaled and reflected by candlelight. They shaped small figures from modeling clay, spent unhurried moments in quiet prayer in the chapel, and rested outdoors under the big trees.',
      'On Friday morning, we parents joined them at the retreat house for the Parents\u2019 Session, followed by the Retreat Closing Mass and a lunch salu-salo together. Thank you to everyone who came, and to all who prayed from wherever they were.',
      'If your child came home with stories to share, or just a little quieter, take the chance to listen. Campus Ministry\u2019s hope is that each child grows in \u201ca deeper awareness and relationship with himself, others, and God,\u201d and that is something we can keep nurturing at home.',
      'Thank you for being such a supportive class community!'
    ],
    galleryLink: 'https://drive.google.com/drive/folders/1cOwicW5Cf2hipfnuIA7gEP1kgMuC-oax',
    gallery: [
      { src: 'news/2026-10-retreat-letters-sofa.jpg', alt: 'Boys on a sofa reading letters', caption: 'Letters on the sofa' },
      { src: 'news/2026-10-retreat-letters-hall.jpg', alt: 'Students quietly reading letters around a hall', caption: 'Quiet corners all around the hall' },
      { src: 'news/2026-10-retreat-journaling-candle.jpg', alt: 'A student journaling by candlelight', caption: 'Journaling by candlelight' },
      { src: 'news/2026-10-retreat-clay-modeling.jpg', alt: 'Students in green class shirts sculpting with modeling clay', caption: 'Creating with modeling clay' },
      { src: 'news/2026-10-retreat-chapel-prayer.jpg', alt: 'Two students praying quietly in the chapel', caption: 'Quiet prayer in the chapel' },
      { src: 'news/2026-10-retreat-grounds-rest.jpg', alt: 'Students resting on a swing and bench under big trees', caption: 'Rest under the trees' }
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
      if (a.caption) fig.appendChild(el('figcaption', 'news-caption', a.caption));
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
    a.body.forEach(function (p) { body.appendChild(el('p', null, p)); });
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
        grid.appendChild(b);
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
      art.querySelector('.news-excerpt').hidden = open;
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
