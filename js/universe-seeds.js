// ------------------------------------------------------------
// Curated starting lists for the Comics and Manga universes
// ------------------------------------------------------------
// While Reddle has few comics or manga of its own, these well-known
// titles fill Popular this week, the home rows and empty lists. Each is
// only a title and its creator (text, no logos or artwork). The site
// searches Open Library for each one (Google Books if it has a key) and
// only uses a result whose title AND creator match and which our strict
// rules (js/sources.js) also call comics or manga. Answers are remembered
// for the browser tab, and the order changes every day.
//
//   t: title, c: creator(s) (any one may match), g: our genres, used for
//      genre rows ("Popular in Fantasy manga")
//
// Loaded on every page after js/sources.js.
// ------------------------------------------------------------

const UNIVERSE_SEEDS = {
  comics: [
    { t: "Watchmen", c: ["Alan Moore"], g: ["science_fiction", "mystery"] },
    { t: "Maus", c: ["Art Spiegelman"], g: ["history", "biography"] },
    { t: "Persepolis", c: ["Marjane Satrapi"], g: ["biography", "history"] },
    { t: "Saga", c: ["Brian K. Vaughan"], g: ["science_fiction", "fantasy"] },
    { t: "V for Vendetta", c: ["Alan Moore"], g: ["dystopian", "thriller"] },
    { t: "The Sandman", c: ["Neil Gaiman"], g: ["fantasy", "horror"] },
    { t: "Fun Home", c: ["Alison Bechdel"], g: ["biography"] },
    { t: "The Dark Knight Returns", c: ["Frank Miller"], g: ["thriller"] },
    { t: "Batman: Year One", c: ["Frank Miller"], g: ["mystery"] },
    { t: "Bone", c: ["Jeff Smith"], g: ["fantasy", "adventure", "children"] },
    { t: "Blankets", c: ["Craig Thompson"], g: ["romance", "biography"] },
    { t: "Ghost World", c: ["Daniel Clowes"], g: ["literary_fiction", "humour"] },
    { t: "Jimmy Corrigan", c: ["Chris Ware"], g: ["literary_fiction"] },
    { t: "The Walking Dead", c: ["Robert Kirkman"], g: ["horror"] },
    { t: "Y: The Last Man", c: ["Brian K. Vaughan"], g: ["science_fiction", "dystopian"] },
    { t: "Hellboy", c: ["Mike Mignola"], g: ["horror", "fantasy"] },
    { t: "Locke & Key", c: ["Joe Hill"], g: ["horror", "fantasy"] },
    { t: "Scott Pilgrim", c: ["Bryan Lee O'Malley"], g: ["romance", "humour"] },
    { t: "Nimona", c: ["ND Stevenson", "Noelle Stevenson"], g: ["fantasy", "young_adult"] },
    { t: "Smile", c: ["Raina Telgemeier"], g: ["children", "biography"] },
    { t: "New Kid", c: ["Jerry Craft"], g: ["children"] },
    { t: "March", c: ["John Lewis"], g: ["history", "biography"] },
    { t: "The Arrival", c: ["Shaun Tan"], g: ["literary_fiction"] },
    { t: "American Born Chinese", c: ["Gene Luen Yang"], g: ["young_adult"] },
    { t: "Habibi", c: ["Craig Thompson"], g: ["literary_fiction"] },
    { t: "Daytripper", c: ["Fábio Moon", "Fabio Moon"], g: ["literary_fiction"] },
    { t: "Asterios Polyp", c: ["David Mazzucchelli"], g: ["literary_fiction"] },
    { t: "Batman: The Killing Joke", c: ["Alan Moore"], g: ["thriller"] },
    { t: "Kingdom Come", c: ["Mark Waid"], g: ["science_fiction"] },
    { t: "Marvels", c: ["Kurt Busiek"], g: ["science_fiction"] },
    { t: "All-Star Superman", c: ["Grant Morrison"], g: ["science_fiction"] },
    { t: "Hawkeye", c: ["Matt Fraction"], g: ["humour", "adventure"] },
    { t: "Ms. Marvel", c: ["G. Willow Wilson"], g: ["young_adult", "adventure"] },
    { t: "Fables", c: ["Bill Willingham"], g: ["fantasy"] },
    { t: "Transmetropolitan", c: ["Warren Ellis"], g: ["science_fiction", "dystopian"] },
    { t: "Paper Girls", c: ["Brian K. Vaughan"], g: ["science_fiction", "adventure"] },
    { t: "Monstress", c: ["Marjorie Liu"], g: ["fantasy"] },
    { t: "Sweet Tooth", c: ["Jeff Lemire"], g: ["dystopian", "adventure"] },
    { t: "Essex County", c: ["Jeff Lemire"], g: ["literary_fiction"] },
    { t: "Through the Woods", c: ["Emily Carroll"], g: ["horror"] },
    { t: "Heartstopper", c: ["Alice Oseman"], g: ["romance", "young_adult"] },
    { t: "Dog Man", c: ["Dav Pilkey"], g: ["children", "humour"] },
    { t: "Calvin and Hobbes", c: ["Bill Watterson"], g: ["humour"] },
    { t: "The Complete Peanuts", c: ["Charles M. Schulz", "Charles Schulz"], g: ["humour"] },
    { t: "Tintin in Tibet", c: ["Hergé", "Herge"], g: ["adventure"] },
    { t: "Asterix the Gaul", c: ["René Goscinny", "Rene Goscinny"], g: ["humour", "adventure"] },
    { t: "Blacksad", c: ["Juan Díaz Canales", "Juan Diaz Canales"], g: ["mystery"] },
    { t: "The Incal", c: ["Alejandro Jodorowsky"], g: ["science_fiction"] },
    { t: "Hilda and the Troll", c: ["Luke Pearson"], g: ["children", "fantasy"] },
    { t: "Amulet", c: ["Kazu Kibuishi"], g: ["fantasy", "children"] },
    { t: "El Deafo", c: ["Cece Bell"], g: ["children", "biography"] },
    { t: "Roller Girl", c: ["Victoria Jamieson"], g: ["children"] },
    { t: "The Umbrella Academy", c: ["Gerard Way"], g: ["science_fiction", "adventure"] },
    { t: "East of West", c: ["Jonathan Hickman"], g: ["science_fiction", "dystopian"] },
    { t: "Descender", c: ["Jeff Lemire"], g: ["science_fiction"] },
    { t: "Lumberjanes", c: ["ND Stevenson", "Noelle Stevenson", "Shannon Watters"], g: ["adventure", "young_adult"] },
    { t: "Building Stories", c: ["Chris Ware"], g: ["literary_fiction"] },
    { t: "Palestine", c: ["Joe Sacco"], g: ["history", "politics"] },
    { t: "This One Summer", c: ["Mariko Tamaki"], g: ["young_adult"] },
    { t: "Laura Dean Keeps Breaking Up with Me", c: ["Mariko Tamaki"], g: ["romance", "young_adult"] },
    { t: "On a Sunbeam", c: ["Tillie Walden"], g: ["science_fiction", "romance"] },
    { t: "Spinning", c: ["Tillie Walden"], g: ["biography"] },
    { t: "They Called Us Enemy", c: ["George Takei"], g: ["history", "biography"] },
    { t: "The Sculptor", c: ["Scott McCloud"], g: ["literary_fiction", "fantasy"] },
    { t: "Understanding Comics", c: ["Scott McCloud"], g: ["art"] },
    { t: "Aya of Yop City", c: ["Marguerite Abouet"], g: ["literary_fiction", "humour"] },
    { t: "The Arab of the Future", c: ["Riad Sattouf"], g: ["biography", "history"] },
    { t: "Ducks", c: ["Kate Beaton"], g: ["biography"] },
    { t: "Hark! A Vagrant", c: ["Kate Beaton"], g: ["humour", "history"] },
    { t: "The League of Extraordinary Gentlemen", c: ["Alan Moore"], g: ["adventure", "fantasy"] },
    { t: "Saga of the Swamp Thing", c: ["Alan Moore"], g: ["horror"] },
    { t: "Batman: The Long Halloween", c: ["Jeph Loeb"], g: ["mystery", "thriller"] },
    { t: "Daredevil: Born Again", c: ["Frank Miller"], g: ["thriller"] },
    { t: "Superman: Red Son", c: ["Mark Millar"], g: ["science_fiction"] },
    { t: "Invincible", c: ["Robert Kirkman"], g: ["science_fiction", "adventure"] },
    { t: "Usagi Yojimbo", c: ["Stan Sakai"], g: ["adventure", "historical_fiction"] },
    { t: "Black Panther", c: ["Ta-Nehisi Coates"], g: ["adventure"] },
    { t: "Gotham Central", c: ["Ed Brubaker", "Greg Rucka"], g: ["mystery"] },
    { t: "Bitter Root", c: ["David F. Walker"], g: ["horror", "historical_fiction"] },
    { t: "Wonder Woman: Earth One", c: ["Grant Morrison"], g: ["adventure"] },
  ],

  manga: [
    { t: "One Piece", c: ["Eiichiro Oda", "尾田栄一郎"], g: ["adventure", "fantasy"] },
    { t: "Naruto", c: ["Masashi Kishimoto", "岸本斉史"], g: ["fantasy", "adventure"] },
    { t: "Dragon Ball", c: ["Akira Toriyama", "鳥山明", "鳥山 明"], g: ["adventure", "humour"] },
    { t: "Akira", c: ["Katsuhiro Otomo", "Katsuhiro Ōtomo", "大友克洋"], g: ["science_fiction", "dystopian"] },
    { t: "Berserk", c: ["Kentaro Miura", "三浦建太郎"], g: ["fantasy", "horror"] },
    { t: "Attack on Titan", c: ["Hajime Isayama", "諫山創"], g: ["fantasy", "dystopian"] },
    { t: "Death Note", c: ["Tsugumi Ohba", "大場つぐみ"], g: ["mystery", "thriller"] },
    { t: "Fullmetal Alchemist", c: ["Hiromu Arakawa", "荒川弘"], g: ["fantasy", "adventure"] },
    { t: "Vagabond", c: ["Takehiko Inoue", "井上雄彦"], g: ["historical_fiction"] },
    { t: "Slam Dunk", c: ["Takehiko Inoue", "井上雄彦"], g: ["humour"] },
    { t: "Monster", c: ["Naoki Urasawa", "浦沢直樹"], g: ["thriller", "mystery"] },
    { t: "20th Century Boys", c: ["Naoki Urasawa", "浦沢直樹"], g: ["mystery", "science_fiction"] },
    { t: "Pluto", c: ["Naoki Urasawa", "浦沢直樹"], g: ["science_fiction", "mystery"] },
    { t: "Nausicaä of the Valley of the Wind", c: ["Hayao Miyazaki", "宮崎駿"], g: ["fantasy", "science_fiction"] },
    { t: "Ghost in the Shell", c: ["Masamune Shirow", "士郎正宗"], g: ["science_fiction"] },
    { t: "Astro Boy", c: ["Osamu Tezuka", "手塚治虫"], g: ["science_fiction", "children"] },
    { t: "Phoenix", c: ["Osamu Tezuka", "手塚治虫"], g: ["fantasy", "historical_fiction"] },
    { t: "Buddha", c: ["Osamu Tezuka", "手塚治虫"], g: ["historical_fiction", "religion"] },
    { t: "Lone Wolf and Cub", c: ["Kazuo Koike", "小池一夫"], g: ["historical_fiction", "adventure"] },
    { t: "Sailor Moon", c: ["Naoko Takeuchi", "武内直子"], g: ["fantasy", "romance"] },
    { t: "Cardcaptor Sakura", c: ["CLAMP"], g: ["fantasy"] },
    { t: "Fruits Basket", c: ["Natsuki Takaya", "高屋奈月"], g: ["romance", "fantasy"] },
    { t: "Nana", c: ["Ai Yazawa", "Yazawa Ai", "矢沢あい", "矢沢 あい"], g: ["romance"] },
    { t: "Ouran High School Host Club", c: ["Bisco Hatori", "葉鳥ビスコ"], g: ["romance", "humour"] },
    { t: "Kimi ni Todoke", c: ["Karuho Shiina", "椎名軽穂"], g: ["romance"] },
    { t: "Yona of the Dawn", c: ["Mizuho Kusanagi", "草凪みずほ"], g: ["fantasy", "romance"] },
    { t: "Demon Slayer", c: ["Koyoharu Gotouge", "Koyoharu Gotōge", "吾峠呼世晴"], g: ["fantasy", "horror"] },
    { t: "Jujutsu Kaisen", c: ["Gege Akutami", "芥見下々"], g: ["fantasy", "horror"] },
    { t: "Chainsaw Man", c: ["Tatsuki Fujimoto", "藤本タツキ"], g: ["horror", "fantasy"] },
    { t: "My Hero Academia", c: ["Kohei Horikoshi", "堀越耕平"], g: ["adventure", "science_fiction"] },
    { t: "Spy x Family", c: ["Tatsuya Endo", "遠藤達哉"], g: ["humour", "thriller"] },
    { t: "Haikyu!!", c: ["Haruichi Furudate", "古舘春一"], g: ["humour"] },
    { t: "One-Punch Man", c: ["ONE", "Yusuke Murata", "村田雄介"], g: ["humour", "adventure"] },
    { t: "Mob Psycho 100", c: ["ONE"], g: ["humour", "fantasy"] },
    { t: "Hunter x Hunter", c: ["Yoshihiro Togashi", "冨樫義博"], g: ["adventure", "fantasy"] },
    { t: "Yu Yu Hakusho", c: ["Yoshihiro Togashi", "冨樫義博"], g: ["fantasy", "adventure"] },
    { t: "Bleach", c: ["Tite Kubo", "久保帯人"], g: ["fantasy", "adventure"] },
    { t: "Fairy Tail", c: ["Hiro Mashima", "真島ヒロ"], g: ["fantasy", "adventure"] },
    { t: "The Promised Neverland", c: ["Kaiu Shirai", "白井カイウ"], g: ["thriller", "fantasy"] },
    { t: "Tokyo Ghoul", c: ["Sui Ishida", "石田スイ"], g: ["horror"] },
    { t: "Parasyte", c: ["Hitoshi Iwaaki", "岩明均"], g: ["horror", "science_fiction"] },
    { t: "Uzumaki", c: ["Junji Ito", "伊藤潤二"], g: ["horror"] },
    { t: "Tomie", c: ["Junji Ito", "伊藤潤二"], g: ["horror"] },
    { t: "Vinland Saga", c: ["Makoto Yukimura", "幸村誠"], g: ["historical_fiction", "adventure"] },
    { t: "Planetes", c: ["Makoto Yukimura", "幸村誠"], g: ["science_fiction"] },
    { t: "Mushishi", c: ["Yuki Urushibara", "漆原友紀"], g: ["fantasy"] },
    { t: "Blade of the Immortal", c: ["Hiroaki Samura", "沙村広明"], g: ["historical_fiction", "fantasy"] },
    { t: "Rurouni Kenshin", c: ["Nobuhiro Watsuki", "和月伸宏"], g: ["historical_fiction", "adventure"] },
    { t: "Inuyasha", c: ["Rumiko Takahashi", "高橋留美子"], g: ["fantasy", "romance"] },
    { t: "Ranma ½", c: ["Rumiko Takahashi", "高橋留美子"], g: ["humour", "romance"] },
    { t: "Maison Ikkoku", c: ["Rumiko Takahashi", "高橋留美子"], g: ["romance", "humour"] },
    { t: "Neon Genesis Evangelion", c: ["Yoshiyuki Sadamoto", "貞本義行"], g: ["science_fiction"] },
    { t: "Trigun", c: ["Yasuhiro Nightow", "内藤泰弘"], g: ["science_fiction", "adventure"] },
    { t: "Dorohedoro", c: ["Q Hayashida", "林田球"], g: ["fantasy", "horror"] },
    { t: "Made in Abyss", c: ["Akihito Tsukushi", "つくしあきひと"], g: ["fantasy", "adventure"] },
    { t: "Frieren", c: ["Kanehito Yamada", "山田鐘人"], g: ["fantasy", "adventure"] },
    { t: "Delicious in Dungeon", c: ["Ryoko Kui", "九井諒子"], g: ["fantasy", "humour"] },
    { t: "Witch Hat Atelier", c: ["Kamome Shirahama", "白浜鴎"], g: ["fantasy"] },
    { t: "Blue Period", c: ["Tsubasa Yamaguchi", "山口つばさ"], g: ["art"] },
    { t: "A Silent Voice", c: ["Yoshitoki Oima", "Yoshitoki Ōima", "大今良時"], g: ["romance", "literary_fiction"] },
    { t: "Your Lie in April", c: ["Naoshi Arakawa", "新川直司"], g: ["romance"] },
    { t: "Orange", c: ["Ichigo Takano", "高野苺"], g: ["romance", "science_fiction"] },
    { t: "Kaguya-sama: Love Is War", c: ["Aka Akasaka", "赤坂アカ"], g: ["romance", "humour"] },
    { t: "Yotsuba&!", c: ["Kiyohiko Azuma", "あずまきよひこ"], g: ["humour", "children"] },
    { t: "Azumanga Daioh", c: ["Kiyohiko Azuma", "あずまきよひこ"], g: ["humour"] },
    { t: "Barefoot Gen", c: ["Keiji Nakazawa", "中沢啓治", "中沢 啓治"], g: ["history"] },
    { t: "Solo Leveling", c: ["Chugong", "DUBU", "추공"], g: ["fantasy", "adventure"] },
    { t: "Tower of God", c: ["SIU", "S.I.U."], g: ["fantasy", "adventure"] },
    { t: "Omniscient Reader's Viewpoint", c: ["Sing Shong", "singNsong", "UMI"], g: ["fantasy"] },
    { t: "True Beauty", c: ["Yaongyi"], g: ["romance"] },
    { t: "Kingdom", c: ["Yasuhisa Hara", "原泰久"], g: ["historical_fiction", "adventure"] },
    { t: "Gintama", c: ["Hideaki Sorachi", "空知英秋"], g: ["humour", "science_fiction"] },
    { t: "Bakuman", c: ["Tsugumi Ohba", "大場つぐみ"], g: ["humour"] },
    { t: "Assassination Classroom", c: ["Yusei Matsui", "Yūsei Matsui", "松井優征"], g: ["humour", "science_fiction"] },
    { t: "Blue Lock", c: ["Muneyuki Kaneshiro", "金城宗幸"], g: ["thriller"] },
    { t: "Dr. Stone", c: ["Riichiro Inagaki", "稲垣理一郎"], g: ["science_fiction", "adventure"] },
    { t: "Soul Eater", c: ["Atsushi Ohkubo", "大久保篤"], g: ["fantasy", "horror"] },
    { t: "Claymore", c: ["Norihiro Yagi", "八木教広"], g: ["fantasy"] },
    { t: "Horimiya", c: ["HERO", "Daisuke Hagiwara", "萩原ダイスケ"], g: ["romance"] },
    { t: "Komi Can't Communicate", c: ["Tomohito Oda", "オダトモヒト"], g: ["humour", "romance"] },
    { t: "Golden Kamuy", c: ["Satoru Noda", "野田サトル"], g: ["historical_fiction", "adventure"] },
    { t: "Solanin", c: ["Inio Asano", "浅野いにお"], g: ["literary_fiction"] },
  ],
};


// ---------- Daily order ----------

// The same shuffled order all day, a new one tomorrow (a small seeded
// shuffle: Fisher-Yates with a pseudo-random number from the date).
function seedsForToday(universe) {
  const list = (UNIVERSE_SEEDS[universe] || []).slice();
  const day = new Date();
  let state = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate() + (universe === "manga" ? 7 : 0);
  const random = function () {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}


// ---------- Finding a seed ----------

const SEED_CACHE_PREFIX = "reddle:seed:v1:";

// "Batman: Year One" -> "batman year one" (no accents or signs, single
// spaces); `joined` leaves out the spaces too ("batmanyearone").
function plainWords(text, joined) {
  const words = String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, " ").trim();
  return joined ? words.replace(/ /g, "") : words;
}

// Same title? Whole words only. The found title may add a volume or a
// subtitle ("Naruto 01", "Saga, Volume 1", "Demon Slayer: Kimetsu no
// Yaiba"); a seed like "Batman: Year One" also matches "Year One".
function sameTitle(found, seed) {
  const a = plainWords(found);
  const options = [seed].concat(String(seed).includes(":") ? [String(seed).split(":").slice(1).join(":")] : []);
  return a.length > 0 && options.some(function (option) {
    const b = plainWords(option);
    return b.length > 0 && (a === b || a.startsWith(b + " "));
  });
}

// Same creator? Any of the seed's names against any of the found names
// (full name, or a part of it long enough to be telling).
function sameCreator(foundNames, seed) {
  const found = (foundNames || []).map((name) => plainWords(name, true)).filter(Boolean);
  return seed.c.some(function (name) {
    const whole = plainWords(name, true);
    const parts = String(name).split(/\s+/).map((part) => plainWords(part, true)).filter((part) => part.length >= 4);
    return found.some((other) => other === whole || other.includes(whole) || parts.some((part) => other.includes(part)));
  });
}

function rememberedSeed(universe, seed) {
  try {
    const saved = sessionStorage.getItem(SEED_CACHE_PREFIX + universe + ":" + seed.t);
    return saved ? JSON.parse(saved) : undefined;
  } catch (error) {
    return undefined;
  }
}

function rememberSeed(universe, seed, book) {
  try {
    sessionStorage.setItem(SEED_CACHE_PREFIX + universe + ":" + seed.t, JSON.stringify(book));
  } catch (error) {}
}

// One seed -> a book in our usual search shape, or null. Open Library
// first (the edition-richest matching work), then Google Books.
async function findSeed(universe, seed) {
  const saved = rememberedSeed(universe, seed);
  if (saved !== undefined) return saved;

  let found = null;
  const url =
    SOURCES_OPEN_LIBRARY + "/search.json?limit=10&sort=editions" +
    "&fields=" + OPEN_LIBRARY_FIELDS +
    "&title=" + encodeURIComponent(seed.t) + "&author=" + encodeURIComponent(seed.c[0]);
  const data = await sourceJson(url);
  for (const doc of (data && data.docs) || []) {
    const book = openLibraryDocToBook(doc);
    const names = (doc.author_name || []).concat(doc.author_alternative_name || []);
    if (sameTitle(book.title, seed.t) && sameCreator(names, seed) && fitsUniverse(book, universe)) {
      found = book;
      break;
    }
  }

  if (!found) {
    const google = await googleJson((
      GOOGLE_BOOKS + "?printType=books&maxResults=10" +
      "&fields=items(id,volumeInfo(title,subtitle,authors,publishedDate,categories,imageLinks,industryIdentifiers,maturityRating,pageCount))" +
      "&q=" + encodeURIComponent('intitle:"' + seed.t + '" inauthor:"' + seed.c[0] + '"')
    ));
    for (const item of (google && google.items) || []) {
      const book = googleVolumeToBook(item);
      if (book && sameTitle(book.title, seed.t) && sameCreator(book.author.split(", "), seed) && bookInUniverse(book, universe)) {
        found = book;
        break;
      }
    }
  }

  if (found) {
    // Our genres for the rows, plus whatever the source said.
    found.genres = [...new Set([...(found.genres || []), ...seed.g])];
    found.seed = true;
  }
  // Only remember real answers (a failed request is tried again later).
  if (found || data) rememberSeed(universe, seed, found);
  return found;
}

// A stream of found seeds for a universe, in today's order, optionally
// only those with one genre. next(count) gives the next `count` books
// (fewer at the end), looking up 6 at a time.
function makeSeedStream(universe, genreSlug) {
  const list = seedsForToday(universe).filter((seed) => !genreSlug || seed.g.includes(genreSlug));
  let position = 0;
  return {
    async next(count) {
      const books = [];
      while (books.length < count && position < list.length) {
        const batch = list.slice(position, position + 6);
        position += batch.length;
        const results = await Promise.all(batch.map((seed) => findSeed(universe, seed).catch(() => null)));
        for (const book of results) if (book) books.push(book);
      }
      return books;
    },
    finished() {
      return position >= list.length;
    },
  };
}
