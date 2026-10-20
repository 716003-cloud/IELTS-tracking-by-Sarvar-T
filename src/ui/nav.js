export const go = path => { if (location.hash !== '#' + path) location.hash = path; };
export const replacePath = path => history.replaceState(null, '', '#' + path);
export const goBack = fallback => { if (history.length > 1) history.back(); else go(fallback); };
