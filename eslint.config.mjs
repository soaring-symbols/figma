import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['dist/**', 'node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
            ],
            'padding-line-between-statements': [
                'error',
                { blankLine: 'always', prev: '*', next: 'return' },
            ],
        },
    },
)
