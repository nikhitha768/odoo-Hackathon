"""Custom password validators for accounts."""

import re
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class CustomPasswordValidator:
    """Validate password complexity: minimum 9 characters, uppercase, lowercase, special char."""

    def validate(self, password, user=None):
        """Validate whether password meets complexity requirements."""
        errors = []
        if len(password) < 9:
            errors.append(
                ValidationError(
                    _("Password must be at least 9 characters long (more than 8 characters)."),
                    code="password_too_short",
                )
            )
        if not re.search(r"[A-Z]", password):
            errors.append(
                ValidationError(
                    _("Password must contain at least one uppercase letter."),
                    code="password_no_upper",
                )
            )
        if not re.search(r"[a-z]", password):
            errors.append(
                ValidationError(
                    _("Password must contain at least one lowercase letter."),
                    code="password_no_lower",
                )
            )
        if not re.search(r"[^A-Za-z0-9]", password):
            errors.append(
                ValidationError(
                    _("Password must contain at least one special character."),
                    code="password_no_special",
                )
            )
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        """Return user-facing help text describing password rules."""
        return _(
            "Your password must be at least 9 characters long (more than 8 characters), "
            "and contain at least one uppercase letter, one lowercase letter, and one special character."
        )
