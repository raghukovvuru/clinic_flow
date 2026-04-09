import frappe


def get_context(context):
	# Called when page loads — pass initial data
	context.no_cache = 1
