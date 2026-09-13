// Permissions are the one thing a Windows runner will not honour: chmod there leaves a
// folder readable and writable, so the checks that turn on being refused say so rather
// than failing for a reason that is not the program's. Root is the other such reader --
// the bits are set and ignored just the same -- so a suite run in a container as root
// steps over them too.
export const THE_FILESYSTEM_HONOURS_PERMISSIONS = process.platform !== 'win32' && process.getuid?.() !== 0;

export const THE_PLATFORM_PIPES_OUTPUT_THE_UNIX_WAY = process.platform !== 'win32';
