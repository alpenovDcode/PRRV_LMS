import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const videos = [
  { cloudflareId: "b83d49d24a8e76e7a7fca6475718827c", title: "Урок 2.3. Как эффективно работать с мини-группой (3–6 учеников)", duration: 1250 },
  { cloudflareId: "1183fa55a2401b845b80d50e887ed411", title: "Урок 2.2. Как эффективно работать с парой учеников в онлайн-формате", duration: 739 },
  { cloudflareId: "064f4eb039fa4c10d676ac04021be9f5", title: "Урок 2.1. Чем отличаются индивидуальные уроки от группового формата", duration: 621 },
  { cloudflareId: "a14b89f740b78cbe1463402e6118df38", title: "Урок 1. Как перевести индивидуальных учеников в группу без отказов", duration: 1096 },
  { cloudflareId: "75a6fc12915d57fb15c3692ae834e8a5", title: "Урок 2.3. Освоение программы МТС Линк", duration: 668 },
  { cloudflareId: "78c2cf68ca45263f3e76271078adb717", title: "Урок 2.2. Освоение программы Яндекс Телемост", duration: 650 },
  { cloudflareId: "b515681ad65a78fffb484977d362ef94", title: "Урок 2.1. Где вести онлайн-занятия?", duration: 1529 },
  { cloudflareId: "896d9e64ae12f5c25b7b04530e053ef1", title: "Урок 1. Как сделать так, чтобы ученик не отвлекался на онлайн занятии и был на 100% включен в работу", duration: 1136 },
  { cloudflareId: "4bb3119d3862a71f478acc22888957d7", title: "Бонусный урок. Как набирать учеников на индивидуальные занятия за высокий чек", duration: 7096 },
  { cloudflareId: "ebd4e0dd4b3580bca999a4151906f1b9", title: "Бонусный урок. 4 психологических упражнения, после которых вы объявите новую цену без дрожи в голосе", duration: 606 },
  { cloudflareId: "2306a80727f9f22a870603a2c7ca3057", title: "Урок 4. Для амбициозных: как стать самым дорогим репетитором в своем городе", duration: 863 },
  { cloudflareId: "79a0402182d98340df11213689fcf5b6", title: "Урок 2. 3 готовых шаблона ответов на возражение “дорого”, после которых цена занятия покажется выгодной", duration: 951 },
  { cloudflareId: "0663463ab47cc835fda034cbd2cb140a", title: "Урок 1. Калькулятор стоимости урока: готовый алгоритм, чтобы заработать максимум и не отпугнуть учеников", duration: 1508 },
  { cloudflareId: "10f959f60f270370f1b16b34bf8b5db5", title: "Урок 1. Калькулятор стоимости урока: готовый алгоритм, чтобы заработать максимум и не отпугнуть учеников ч1", duration: 1511 },
  { cloudflareId: "51a36404bd928ba19d3124d17b6963c2", title: "Урок 8. Продвинутая технология: как выйти в топ Профи.ру и получать учеников на автопилоте ч2", duration: 173 },
  { cloudflareId: "6e663e1f5752db75b82a4639dc2af948", title: "Урок 8. Продвинутая технология: как выйти в топ Профи.ру и получать учеников на автопилоте ч1", duration: 369 },
  { cloudflareId: "f098d5f994bcc216fdb19e0237d500f0", title: "Урок 7. Тариф “Премиум” на Профи.ру: как с его помощью зарабатывать в 5 раз больше", duration: 425 },
  { cloudflareId: "af27df7e36259a01a173ea1474cb34f4", title: "Урок 6. Как сэкономить больше 50% на комиссиях без потери заказов", duration: 688 },
  { cloudflareId: "44eb8d84352ffa862c46b371eaa23dae", title: "Урок 5. 3 шага от мелких заказов к высоким чекам: стратегия раскрутки аккаунта на Профи с нуля", duration: 1131 },
  { cloudflareId: "fc89dafee71240adfb00741e19d70e9d", title: "Бонусный урок. Разбор реальных откликов репетиторов на Профи от рисования до английского языка", duration: 13153 },
  { cloudflareId: "439d9e2fb29ad0d96eacc5096272a6d5", title: "Урок 4. Что писать в откликах на заявки, чтобы выбирали именно вас ч2", duration: 447 },
  { cloudflareId: "74b2f16190cb9efab5bc4f48e002786e", title: "Урок 4. Что писать в откликах на заявки, чтобы выбирали именно вас ч1", duration: 3351 },
  { cloudflareId: "98188fdd5b7d4141640e5aa21a41ebe9", title: "Урок 3. Статистика вместо интуиции: как рассчитать нужное количество откликов (на основе анализа 1000+ репетиторов) ч2", duration: 441 },
  { cloudflareId: "f9dbf52f181de8f05e7d947d2db660cd", title: "Урок 3. Статистика вместо интуиции: как рассчитать нужное количество откликов (на основе анализа 1000+ репетиторов) ч1", duration: 1115 },
  { cloudflareId: "83270bf5ccace75fe6c1f405fcc8c8fb", title: "Урок 2. Как не попасть на блокировку аккаунта", duration: 1318 },
  { cloudflareId: "2149e558d830ec14625777e0ed8037a1", title: "Урок 1. Чек-лист по настройке Профи, который принес 674.000.000+ нашим репетиторам ч2", duration: 531 },
  { cloudflareId: "6c56f3f4a5053b14dc7c87c76202024a", title: "Урок 1. Чек-лист по настройке Профи, который принес 674.000.000+ нашим репетиторам ч1", duration: 2124 },
  { cloudflareId: "0353700d2c589ca1009720ed1ca63987", title: "Вводный урок. Основы Профи.ру", duration: 950 },
  { cloudflareId: "e0116139835379b231912f626ce57589", title: "Урок 5. Для продвинутых: стратегия выхода на 1.000.000₽ на групповых занятиях (разбор реальных кейсов)", duration: 788 },
  { cloudflareId: "a046ace63a5b67275c3b872e5705e28e", title: "Урок 4. Нам нужно только индивидуально!", duration: 639 },
  { cloudflareId: "4e2dffd707f235031b023fd291e133f9", title: "Урок 3. Сбор группы из новых учеников за 1-2 недели с нуля", duration: 902 },
  { cloudflareId: "916d436f762927a1f108aa7c51d7ea83", title: "Урок 2.4. Как эффективно работать с большой онлайн-группой", duration: 781 },
  { cloudflareId: "28d6a1ca9494558a752c77df344de558", title: "Урок 2.3. Как эффективно работать с мини-группой (3–6 учеников)", duration: 1250 },
  { cloudflareId: "8df3c49deb224613d99d5a34da324740", title: "Урок 2.2. Как эффективно работать с парой учеников в онлайн-формате", duration: 739 },
  { cloudflareId: "ce580d617fc90557c3fcba0518ad7bf7", title: "Урок 2.1. Чем отличаются индивидуальные уроки от группового формата", duration: 621 },
  { cloudflareId: "30c3f3bf149dbec6d0ffe5bb899cb89a", title: "Урок 1. Как перевести индивидуальных учеников в группу без отказов", duration: 1096 },
  { cloudflareId: "cc36237e7cc8a880216cb38e5e1f99d1", title: "Урок 2.4. Освоение программы Контур Толк", duration: 826 },
  { cloudflareId: "fe0aef362d0bc458ef1d92e700b373a0", title: "Урок 2.5. Освоение программы Zoom для проведения онлайн-уроков", duration: 1944 },
  { cloudflareId: "6e37793d33c5aa9a21391b21c9a3275a", title: "Урок 2.6. Освоение программы VK Tutoria", duration: 949 },
  { cloudflareId: "38f1e11638bdd46ee7cf54077bffeb50", title: "Урок 2.7. Освоение программы Google Meet", duration: 572 },
  { cloudflareId: "48b5316090b0b7528835310e84bd1b26", title: "Урок 3.1. Создаем материалы к онлайн-уроку, которые впечатляют", duration: 1124 },
  { cloudflareId: "31dac31a8d73dd7f01bfa5c751ce09d1", title: "Урок 3.2. Освоение программы Gamma", duration: 1569 },
  { cloudflareId: "f6c6c7ff2b0bdc8c0be4426394aeb671", title: "Урок 3.3. Освоение программы Supa", duration: 500 },
  { cloudflareId: "301adc3b15f1cb20706dc26a9bf511d5", title: "Урок 3.4. Освоение программы Yutu Класс", duration: 1528 },
  { cloudflareId: "4dfee6e97b026e2ad50eadcd49bf8b7b", title: "Урок 3.5. Мастер-класс по созданию материалов к урокам на платформе Holst", duration: 5738 },
  { cloudflareId: "76d97c45bf2f618f4c9844aa356ce1f7", title: "Урок 4.1. Геймификация уроков", duration: 1222 },
  { cloudflareId: "674eb6126e2b66ea33773ab7b5745dfb", title: "Урок 4.2. Освоение сервисов Яндекса", duration: 1247 },
  { cloudflareId: "911e7045fa620e183c8758ddd7fee8f2", title: "Урок 4.3. Освоение платформ Google-диск и Google-таблицы", duration: 2362 },
  { cloudflareId: "324b10b9e5fc9d4a9753fab0d9935061", title: "Урок 4.4. Шаблоны для ваших занятий в Миро (аналог Holst)", duration: 2957 },
  { cloudflareId: "03b040df8bf93aa6ac97f37129264228", title: "Урок 4.5. Освоение программы Joyteka", duration: 1121 },
  { cloudflareId: "ce4afc86e7b6d4e2754204562d209d39", title: "Дополнительный урок. Освоение платформы Formative", duration: 1487 },
  { cloudflareId: "d0dc76ca39df36197b8728369f9c9846", title: "Дополнительный урок. Освоение платформы Online test pad", duration: 712 },
  { cloudflareId: "29f838c8c5ab36c9cf8f6bc483c95b3e", title: "Урок 5. Конспекты, от которых не оторваться: визуальное мышление в действии", duration: 458 },
  { cloudflareId: "d4f70b4343bf041a8233870ce21f2fb7", title: "Урок 6.1. Интерактивы как способ сделать урок вовлекающим", duration: 731 },
  { cloudflareId: "31c204325cd87f0690555906f717d11b", title: "Урок 6.2. Освоение программы Wordwall", duration: 374 },
  { cloudflareId: "cdc5bfa7306b6112b5155e0674437d76", title: "Урок 6.3. Освоение программы LearningApps", duration: 440 },
  { cloudflareId: "8f4b3d244679c3aca3d51aaf2b3092ff", title: "Урок 6.4. Освоение программы Interacty", duration: 872 },
  { cloudflareId: "eb6c109d1dcd0b542380d9b6cfed6eeb", title: "Лекция 7.2. Самоопределение: кто я?", duration: 1494 },
  { cloudflareId: "bba2718770cef3661666cf304a296ecd", title: "Лекция 7.1. Самоопределение: кто я?", duration: 3752 },
  { cloudflareId: "656a70d00a9e4b7e368b9f8c77f0d56e", title: "Лекция 6. Когда эмоции мешают?", duration: 1982 },
  { cloudflareId: "9674e8aa1e53ec83a53f4e24fef6d545", title: "Лекция 5.2. Синдром самозванца", duration: 1747 },
  { cloudflareId: "9cb278b440bb7cdb85898ad3bb429a20", title: "Урок 5. Устойчивая самооценка репетитора: как не терять веру в себя даже в случае неудачи ученика и плохого отзыва", duration: 5014 },
  { cloudflareId: "6791d279b6ffe4b3be8d699467807879", title: "Лекция 4.2. Как ставить и достигать цели", duration: 1978 },
  { cloudflareId: "2ac6698ca84f78f4d828f88e24795a26", title: "Урок 4. Наука достижений: как репетитору ставить и достигать цели по принципам когнитивной психологии", duration: 1147 },
  { cloudflareId: "76a24bf738ecd4a1ac61741d11d3734a", title: "Лекция 3.2. Баланс нагрузки, концентрация и отдых", duration: 1293 },
  { cloudflareId: "4ff896c2331bcd58ae7656e518b456e4", title: "Урок 3. Предохранитель от выгорания: психологические приемы против перегрузки", duration: 1554 },
  { cloudflareId: "204403a68d5e62dc3882e8ce04132515", title: "Урок 2. 6 психологических принципов общения с учениками и родителями, чтобы вас слушали и уважали", duration: 2670 },
  { cloudflareId: "afa28387beb15aad1f9d8f68e0f65302", title: "Урок 1. Психологический ликбез", duration: 2302 },
  { cloudflareId: "d767d85073474b6ffda686e25d312c81", title: "Мастер-класс Как продавать легко и дорого", duration: 9410 },
  { cloudflareId: "2a4032e0f89d78029a0c2fb1ebcb1bc7", title: "Порядок в делах: сервис,  который поможет учитывать расписание и оплаты", duration: 1227 },
  { cloudflareId: "24fef4b8693cb34abdb705ce2a519ea2", title: "Как брать заявки из закрытой базы Прорыва", duration: 899 },
  { cloudflareId: "b2f45dda059825e9e93c5a8f873b4b49", title: "Готовый список действий, чтобы получить желаемый результат от обучения", duration: 1888 },
  { cloudflareId: "32bb50045c204ddc85cc3f50a2110588", title: "Что делать, если происходит откат и падает мотивация", duration: 1496 },
  { cloudflareId: "91aa28908203263d4bb966d64347d958", title: "Как сформировать навык продвижения себя как репетитора", duration: 1508 },
  { cloudflareId: "3cd3f9c4b0d1ab481a9a0f7db3655ae2", title: "Как учиться на Прорыве", duration: 4894 },
  { cloudflareId: "a8ea276ebfdea687a4b6e35527f2e62c", title: "Урок 3. Формула пробного урока", duration: 1688 },
  { cloudflareId: "25dbac625a4442dcd7df9e5ab30c2e1c", title: "Урок 2. Готовый шаблон разговора по телефону, после которого ученики сразу записываются на занятия", duration: 1023 },
  { cloudflareId: "d3f4c8b18a940c752d312c63249e3b22", title: "Урок 1. Готовый шаблон переписки, после которого ученики сразу записываются на занятия", duration: 2369 },
  { cloudflareId: "9d625dbf129996714e050e8a0f2b8ab1", title: "Урок 4. Объявление-ловушка: как 1 раз составить текст, который будет 2-3 года приносить вам учеников", duration: 790 },
  { cloudflareId: "719805d6d71513cafa6fce89faff0c8c", title: "Урок 3. Как найти свою уникальность и предлагать занятия так, чтобы привлекать ваших идеальных учеников", duration: 1793 },
  { cloudflareId: "ebc12ba3222c9f5ef4dcc559810e5104", title: "Урок 2. Фотография, которая увеличит поток учеников в 2 раза (в домашних условиях, в студии или с помощью ИИ)", duration: 640 },
  { cloudflareId: "66c2e940dbe5800efb0d43e1ff8a3bac", title: "Урок 1. Отзыв – автопродавец", duration: 1788 },
  { cloudflareId: "d3673e26043f2f24bd6e28724add3433", title: "Бонусный урок. Мастер-класс с разбором реальных кейсов в работе со взрослыми", duration: 3761 },
  { cloudflareId: "d4fdc5de0ccee57789b8c24547e9dd59", title: "Бонусный урок. Асинхронное обучение: методика преподавания без жесткого графика", duration: 7172 },
  { cloudflareId: "dffc515b46cf625f60705b99fec0891d", title: "Бонусный урок. Разбор методики высоко-результативной подготовки к ОГЭ и ЕГЭ, которая принесла преподавателю 60+ стобалльников", duration: 9947 },
  { cloudflareId: "8b6722b6994380f5a0cc58bb8f7a647c", title: "Урок 8. Эмоциональный дизайн урока: от скуки к восхищению", duration: 870 },
  { cloudflareId: "16eb38602ea649db00d24b28e24bc103", title: "Урок 7. 3 готовые схемы объяснения, после которых ученик поймет даже самую сложную тему за 1 урок", duration: 642 },
  { cloudflareId: "97aff6c4d0d6cd2ac7cda22816c680d6", title: "Урок 6. Метод стоп-расфокус: 5 приемов, которые удержат внимание даже самых неусидчивых учеников", duration: 414 },
  { cloudflareId: "8970f5d705ac858872cbeb636370d389", title: "Урок 5. 4 технологии для быстрого запоминания темы без зубрежки", duration: 610 },
  { cloudflareId: "aa37e581b12a9342de1d01160344b0fb", title: "Урок 4. Технология edutainment: как превратить обычное занятие в урок с “вау-эффектом”", duration: 974 },
  { cloudflareId: "0e5d961448fbd136901a1b682ec0e5ae", title: "Урок 3. Как формировать домашнее задание, чтобы оно перестало быть «довеском» к уроку и помогало быстрее привести к результату", duration: 957 },
  { cloudflareId: "3531aca1126b3c1fde8290d89c352669", title: "Урок 2. Универсальная техника проведения урока: как построить занятие, чтобы ученику было легко, интересно и результативно", duration: 659 },
  { cloudflareId: "cb382b6a1adfa15cfa9d5670b85d85f1", title: "Урок 1. Конструктор прогресса: как систематизировать разрозненные уроки в эффективную программу", duration: 1638 },
  { cloudflareId: "a0ef91f165e6627707a862d6c438f8ee", title: "Активация сарафанного радио", duration: 985 },
  { cloudflareId: "b5102789df37d79ff0b2fcb0f2df1593", title: "Готовый список действий, чтобы получить желаемый результат от обучения", duration: 1888 },
  { cloudflareId: "f47775c94cad8d9d637ce5f0e8d8877b", title: "Что делать, если происходит откат и падает мотивация ", duration: 1496 },
  { cloudflareId: "8f56135d1f7613205bc9927e90f06ef5", title: "Как сформировать навык продвижения себя как репетитора", duration: 1508 },
];

async function main() {
  console.log("Seeding video library...");

  for (const video of videos) {
    await prisma.videoLibrary.upsert({
      where: { cloudflareId: video.cloudflareId },
      update: {
        title: video.title,
        duration: video.duration,
      },
      create: {
        cloudflareId: video.cloudflareId,
        title: video.title,
        duration: video.duration,
      },
    });
  }

  console.log(`Seeded ${videos.length} videos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
