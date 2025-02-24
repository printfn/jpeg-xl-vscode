# Release Process

- Update changelog
- Bump all dependencies
- Update version number in `package.json`
- `npm up`
- `npm run format`
- `npm run lint`
- `git commit -am "Release v1.X.X"`
- `vsce package`
- `vsce publish`
- `git push`
- `git tag v1.X.X`
- `git push --tags`
- Go to GitHub and create a new release with the `.vsix` file
- Log in to OpenVSX and publish the new version
