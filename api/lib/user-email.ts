function letters(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

export function userEmailCandidates(names: string, firstSurname: string, secondSurname = '') {
  const initials = names.trim().split(/\s+/).map(letters).filter(Boolean).slice(0, 2).map(name => name[0]);
  const surnames = [firstSurname, secondSurname].map(letters).filter(Boolean);
  return [...new Set(initials.flatMap(initial => surnames.map(surname =>
    `${initial}${surname.slice(0, 63)}@restaurante.gt`)))];
}
