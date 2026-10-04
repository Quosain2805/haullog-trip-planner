from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("suggest/", views.suggest),
    path("plan/", views.plan),
]
