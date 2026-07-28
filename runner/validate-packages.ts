const PACKAGE_SPEC_RE = /^[A-Za-z0-9@][A-Za-z0-9@._/=-]*$/;

export function validatePackages(packages: string[]): void {
	for (const pkg of packages) {
		if (!PACKAGE_SPEC_RE.test(pkg)) throw new Error(`Invalid package specifier: ${pkg}`);
	}
}
