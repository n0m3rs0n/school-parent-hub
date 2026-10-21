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
    title: 'Two Days of Prayer and Reflection: Our 11-Escribano Class Retreat',
    author: 'Posted by Nom & Kat, Class Parent Reps',
    image: 'news/2026-10-class-retreat.jpg',
    imageAlt: 'The 11-Escribano class smiling together inside a wood-panelled chapel',
    caption: 'The 11-Escribano class together in the chapel.',
    excerpt: 'On October 15–16, our kids set aside classes and screens for their Ignatian Class Retreat at the Sacred Heart Novitiate in Novaliches. Here is a look back at those two days.',
    body: [
      'Dear fellow 11-Escribano parents,',
      'Last Thursday and Friday, October 15–16, our children stepped away from their usual school routine for their Ignatian Class Retreat at the Sacred Heart Novitiate & Retreat House along Quirino Highway in Novaliches, Quezon City.',
      'Rooted in the spirituality of St. Ignatius of Loyola, the retreat is a required formation experience for every ASHS student, a dedicated time for prayer, reflection, and discernment. In Campus Ministry\u2019s words, the hope is that each child develops \u201ca deeper awareness and relationship with himself, others, and God.\u201d',
      'The two days began with a Send-off Mass at 7:50 AM on Thursday at the St. Aloysius Gonzaga Chapel on campus. From there, the class was accompanied throughout by the retreat team: Campus Ministers Mr. Nigel Perea and Mr. Kent Sarcol, together with our Class Moderator, Ms. Lumasang. Thank you for guiding our kids and keeping them safe.',
      'On Friday morning, we parents were invited to the retreat house for a Parents\u2019 Session at 9:30 AM, followed by the Retreat Closing Mass at 11:00 AM and a lunch salu-salo at noon. Thank you to everyone who joined us, and to all who sent their prayers from wherever they were.',
      'If your child came home a little quieter or with stories to share, take the chance to listen. These moments of reflection are a gift we can keep nurturing at home.',
      'Thank you for being such a supportive class community. See you at the next gathering!'
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

  // Deep link (news.html#id) opens that article.
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) {
    const t = target.querySelector('.news-toggle');
    if (t && t.getAttribute('aria-expanded') === 'false') t.click();
    target.scrollIntoView();
  }
})();
