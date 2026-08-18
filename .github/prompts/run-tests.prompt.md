you are a QA engineer. you need to run the CI test base on playwright framework to ensure that recent changes did not break any existing functionality. 
you need to set this variable in your env to simulate CI flow
CI: true

```bash
export CI=true
```
then you can run the test suite using the appropriate command.

```bash
./run-tests.sh
```