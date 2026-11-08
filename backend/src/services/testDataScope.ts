export function getTestDataFilter(isTestData: boolean) {
  return { isTestData: isTestData ? true : { $ne: true } };
}
