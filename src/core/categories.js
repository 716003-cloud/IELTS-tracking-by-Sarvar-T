// Default mistake categories. They are only suggestions: users can add, rename-by-adding and archive
// categories in Settings (stored in the settings store, so this file is just the seed).
export const DEFAULT_CATEGORIES = {
  listening: [
    ['l_spelling', 'Spelling mistakes'],
    ['l_follow', 'Missed information because I could not follow the recording'],
    ['l_accents', 'Difficulty understanding accents or pronunciation'],
    ['l_paraphrase', 'Did not recognise paraphrasing'],
    ['l_distractors', 'Distracted by misleading information or distractors'],
    ['l_concentration', 'Lost concentration'],
    ['l_speed', 'Could not keep up with the speed of the recording'],
    ['l_question', 'Did not understand the question properly'],
    ['l_vocab', 'Vocabulary difficulties'],
    ['l_grammar', 'Grammar or word-form mistakes'],
    ['l_wrong', 'Entered the wrong answer despite understanding the recording'],
    ['l_other', 'Other'],
  ],
  reading: [
    ['r_understand', 'Did not understand the passage'],
    ['r_paraphrase', 'Did not recognise paraphrasing'],
    ['r_vocab', 'Vocabulary difficulties'],
    ['r_locate', 'Could not locate the relevant information'],
    ['r_distractors', 'Confused by distractors'],
    ['r_question', 'Misunderstood the question'],
    ['r_tfng', 'True/False/Not Given confusion'],
    ['r_matching', 'Matching headings or information difficulties'],
    ['r_spelling', 'Spelling mistakes'],
    ['r_wordlimit', 'Word-limit mistakes'],
    ['r_time', 'Ran out of time'],
    ['r_concentration', 'Lost concentration'],
    ['r_other', 'Other'],
  ],
};

export const seedCategories = () => ({
  listening: DEFAULT_CATEGORIES.listening.map(([id, label]) => ({ id, label, archived: false })),
  reading: DEFAULT_CATEGORIES.reading.map(([id, label]) => ({ id, label, archived: false })),
});

export const REVIEW_STATES = [
  { id: 'improved', label: 'Improved', icon: '✓' },
  { id: 'not_improved', label: 'Not improved', icon: '✗' },
  { id: 'not_assessed', label: 'Not assessed yet', icon: '○' },
];
